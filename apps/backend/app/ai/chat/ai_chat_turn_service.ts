import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'

import { type AiAgentPageContext, createAiAgentStream } from '#ai/chat/ai_agent_service'
import type { AiChatResolvedRegeneration } from '#ai/chat/ai_chat_regeneration'
import {
  startAiChatSseKeepalive,
  streamAiAgentTurnEvents,
  writeAiChatSse,
} from '#ai/chat/ai_chat_sse_adapter'
import { resetAiConversationState } from '#ai/chat/ai_conversation_state'
import {
  attachAgentRunConfirmations,
  failUnattachedAgentRunConfirmations,
} from '#ai/core/ai_agent_confirmation'
import {
  isAiAgentReadTool,
  isRecoverableAiAgentReadToolError,
  maxConsecutiveAiAgentReadToolFailures,
  sanitizeAiAgentToolErrorMessage,
} from '#ai/core/ai_agent_tool_errors'
import { aiAgentConfirmationNarrationPrompt } from '#ai/policy/ai_agent_prompt_policy'
import { releaseAiAgentRun } from '#ai/runtime/ai_agent_run_registry'
import type AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage, {
  type AiChatCitation,
  type AiChatRuntimeDetail,
} from '#models/ai_chat_message'
import { recordAiUsageEvent } from '#services/ai_usage_service'
import {
  serializeAiChatConversation,
  serializeAiChatMessage,
} from '#transformers/ai_chat_transformer'

const MAX_CONFIRMATION_CLEANUP_ATTEMPTS = 3
const CONFIRMATION_CLEANUP_RETRY_DELAY_MS = 150

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function getSafeAiErrorMessage(error: unknown) {
  if (isAbortError(error)) return '已停止生成本次回复。'
  return '本次 AI 请求未完成，请稍后重试。'
}

export function getTerminalToolAssistantContent(
  output: unknown,
  toolName: string,
  reportReadFailure: boolean
) {
  if (!output || typeof output !== 'object' || !('kind' in output)) return null
  if (isRecoverableAiAgentReadToolError(toolName, output) && !reportReadFailure) return null
  const payload = output as { kind?: unknown; message?: unknown }
  if (payload.kind === 'action_error' || payload.kind === 'query_error') {
    const label = isAiAgentReadTool(toolName) ? '读取未完成' : '操作未完成'
    return typeof payload.message === 'string' ? `${label}：${payload.message}` : `${label}。`
  }
  return null
}

export function markConfirmationNarrationFailure(runtimeDetails: AiChatRuntimeDetail[]) {
  const pendingTool = [...runtimeDetails]
    .reverse()
    .find((detail) => detail.kind === 'tool' && detail.phase === 'awaiting_confirmation')
  if (pendingTool?.kind === 'tool') {
    pendingTool.state = 'error'
    pendingTool.phase = 'failed'
    pendingTool.message = '无法生成操作说明，待确认操作未创建。'
  }
  return '我暂时无法生成清晰的操作说明，因此没有创建待确认操作。请稍后重试。'
}

export function shouldPreserveInterruptedRun(error: unknown) {
  return isAbortError(error)
}

async function failUnattachedConfirmationsWithRetry(input: {
  conversationId: number
  userId: number
  agentRunId: string
  ctx: HttpContext
}) {
  const attributes = {
    conversationId: input.conversationId,
    userId: input.userId,
    agentRunId: input.agentRunId,
  }
  for (let attempt = 1; attempt <= MAX_CONFIRMATION_CLEANUP_ATTEMPTS; attempt += 1) {
    try {
      await failUnattachedAgentRunConfirmations(input)
      return
    } catch (error) {
      if (attempt === MAX_CONFIRMATION_CLEANUP_ATTEMPTS) {
        logger.error(
          { err: error, ...attributes },
          'AI unattached confirmation cleanup failed after retries'
        )
        return
      }
      await new Promise((resolve) =>
        setTimeout(resolve, CONFIRMATION_CLEANUP_RETRY_DELAY_MS * attempt)
      )
    }
  }
}

export async function runAiChatAssistantTurn(input: {
  conversation: AiChatConversation
  userId: number
  userMessage: AiChatMessage
  assistantMessage?: AiChatMessage
  regeneration: AiChatResolvedRegeneration<AiChatMessage> | null
  capabilityMode?: import('#ai/core/ai_agent_tool_context').AiAgentCapabilityMode
  enabledToolNames?: string[]
  emitUserMessage?: boolean
  context?: AiAgentPageContext
  signal: AbortSignal
  response?: HttpContext['response']
  ctx: HttpContext
  onEvent?: (event: string, data: unknown) => void | Promise<void>
}) {
  const { conversation, userId, userMessage, regeneration, response } = input
  const emit = (event: string, data: unknown) => {
    if (response) writeAiChatSse(response, event, data)
    return input.onEvent?.(event, data)
  }
  let assistantContent = input.assistantMessage?.content ?? ''
  let agentRunId: string | null = null
  let persistedAssistantMessage = input.assistantMessage ?? null
  let lastPersistedContentLength = assistantContent.length
  const knowledgeCitations = new Map<string, AiChatCitation>()
  for (const citation of input.assistantMessage?.citations ?? []) {
    knowledgeCitations.set(`${citation.documentId}:${citation.chunkId}`, citation)
  }
  const runtimeDetails: AiChatRuntimeDetail[] = [...(input.assistantMessage?.runtimeDetails ?? [])]
  let consecutiveReadToolFailures = 0
  const attachedConfirmations: Array<
    Awaited<ReturnType<typeof attachAgentRunConfirmations>>[number] & { messageId: number }
  > = []
  let aiFailureStage = 'initialization'

  const persistAssistantMessage = async (allowEmpty = false) => {
    if (!assistantContent.trim() && !persistedAssistantMessage && !allowEmpty) return null

    const attributes = {
      content: assistantContent,
      citations: [...knowledgeCitations.values()],
      runtimeDetails,
    }
    if (persistedAssistantMessage) {
      persistedAssistantMessage.merge(attributes)
      await persistedAssistantMessage.save()
      lastPersistedContentLength = assistantContent.length
      return persistedAssistantMessage
    }

    persistedAssistantMessage = await AiChatMessage.create({
      conversationId: conversation.id,
      role: 'assistant',
      ...attributes,
    })
    lastPersistedContentLength = assistantContent.length
    return persistedAssistantMessage
  }

  let stopKeepalive: (() => void) | undefined

  try {
    if (response) stopKeepalive = startAiChatSseKeepalive(response)
    if (input.emitUserMessage !== false) {
      emit('user', {
        conversation: serializeAiChatConversation(conversation),
        message: serializeAiChatMessage(userMessage),
      })
    }

    const regenerate = regeneration !== null
    if (!regenerate) {
      await conversation.load('messages', (query) => query.orderBy('created_at', 'asc'))
    }

    const history = regenerate
      ? regeneration.messages
          .filter((message) => message.role !== 'assistant' || message.content.trim())
          .map((message) => ({
            role: message.role,
            content: message.content,
            id: message.id,
          }))
      : [
          ...conversation.messages
            .filter(
              (message) =>
                message.id !== userMessage.id &&
                (message.role !== 'assistant' || message.content.trim())
            )
            .map((message) => ({
              role: message.role,
              content: message.content,
              id: message.id,
            })),
          { role: userMessage.role, content: userMessage.content, id: userMessage.id },
        ]
    const usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      modelCalls: 0,
    }
    aiFailureStage = 'agent_stream'
    const run = await createAiAgentStream({
      conversationId: conversation.id,
      userId,
      auditContext: input.ctx,
      messages: history,
      capabilityMode: input.capabilityMode,
      enabledToolNames: input.enabledToolNames,
      context: input.context,
      signal: input.signal,
      onKnowledgeSources: (sources) => {
        for (const source of sources) {
          knowledgeCitations.set(`${source.documentId}:${source.chunkId}`, source)
        }
        void emit('agent_citations', {
          citations: [...knowledgeCitations.values()],
        })
      },
      onCredentialDisclosure: (credential) => emit('credential_disclosure', { credential }),
      onCompactionUsage: ({ usage: compactionUsage }) => {
        usage.modelCalls += 1
        usage.inputTokens += compactionUsage.input
        usage.outputTokens += compactionUsage.output
        usage.cacheReadTokens += compactionUsage.cacheRead
        usage.cacheWriteTokens += compactionUsage.cacheWrite
        usage.totalTokens += compactionUsage.totalTokens
      },
    })
    agentRunId = run.agentRunId
    const streamStartedAt = Date.now()
    aiFailureStage = 'message_stream'
    for await (const event of streamAiAgentTurnEvents(run, input.signal)) {
      if (input.signal.aborted) {
        throw new DOMException('AI request was cancelled', 'AbortError')
      }
      if (event.source === 'frame') {
        if (event.value.event === 'agent_status') {
          const status = event.value.data
          if (status.state === 'error' && status.detail?.action && status.message) {
            const toolError = sanitizeAiAgentToolErrorMessage(status.message)
            if (toolError) {
              assistantContent =
                getTerminalToolAssistantContent(
                  { kind: 'action_error', message: toolError },
                  status.name,
                  true
                ) ?? toolError
            }
          }
          const detail: AiChatRuntimeDetail = {
            kind: 'tool',
            name: status.name,
            state: status.state,
            ...(status.callId ? { callId: status.callId } : {}),
            ...(status.durationMs !== undefined ? { durationMs: status.durationMs } : {}),
            ...(status.message ? { message: status.message } : {}),
            ...(status.phase ? { phase: status.phase } : {}),
            ...(status.errorCode ? { errorCode: status.errorCode } : {}),
            ...(status.detail ? { detail: status.detail } : {}),
          }
          const existingIndex = runtimeDetails.findIndex(
            (item) => item.kind === 'tool' && item.callId === detail.callId
          )
          if (existingIndex >= 0) runtimeDetails[existingIndex] = detail
          else runtimeDetails.push(detail)
        }
        if (event.value.event === 'agent_plan') {
          const planDetail: AiChatRuntimeDetail = {
            kind: 'plan',
            steps: event.value.data.steps.map((step) => ({ ...step })),
          }
          const existingIndex = runtimeDetails.findIndex((item) => item.kind === 'plan')
          if (existingIndex >= 0) runtimeDetails[existingIndex] = planDetail
          else runtimeDetails.push(planDetail)
        }
        if (event.value.event === 'tool_completed') {
          const { name, output } = event.value.data
          const readFailure = isRecoverableAiAgentReadToolError(name, output)
          if (readFailure) consecutiveReadToolFailures += 1
          else if (isAiAgentReadTool(name)) consecutiveReadToolFailures = 0
          const terminalContent = getTerminalToolAssistantContent(
            output,
            name,
            consecutiveReadToolFailures >= maxConsecutiveAiAgentReadToolFailures
          )
          if (terminalContent) {
            if (
              output &&
              typeof output === 'object' &&
              'kind' in output &&
              output.kind === 'action_error'
            ) {
              if (assistantContent.trim() !== terminalContent) {
                assistantContent = terminalContent
                await persistAssistantMessage()
              }
              continue
            }
            const visibleContent = assistantContent.trim()
              ? `\n\n${terminalContent}`
              : terminalContent
            assistantContent += visibleContent
            await emit('delta', { content: visibleContent })
            await persistAssistantMessage()
          }
          continue
        }
        if (event.value.event === 'agent_confirmation') {
          if (!assistantContent.trim()) {
            usage.modelCalls += 1
            let narrationContent = ''
            try {
              const narration = await run.models.completeSimple(
                run.model,
                {
                  systemPrompt: aiAgentConfirmationNarrationPrompt,
                  messages: [
                    {
                      role: 'user',
                      content: `<user-request>${JSON.stringify(userMessage.content)}</user-request>`,
                      timestamp: Date.now(),
                    },
                  ],
                },
                { signal: input.signal }
              )
              usage.inputTokens += narration.usage.input
              usage.outputTokens += narration.usage.output
              usage.cacheReadTokens += narration.usage.cacheRead
              usage.cacheWriteTokens += narration.usage.cacheWrite
              usage.totalTokens += narration.usage.totalTokens
              try {
                await recordAiUsageEvent({
                  userId,
                  conversationId: conversation.id,
                  agentRunId: run.agentRunId,
                  callSequence: run.nextModelCallSequence(),
                  providerId: run.model.provider,
                  modelId: run.model.id,
                  baseUrl: run.model.baseUrl,
                  usage: {
                    input: narration.usage.input,
                    output: narration.usage.output,
                    cacheRead: narration.usage.cacheRead,
                    cacheWrite: narration.usage.cacheWrite,
                    totalTokens: narration.usage.totalTokens,
                  },
                  status: narration.stopReason === 'stop' ? 'completed' : 'failed',
                })
              } catch (error) {
                logger.warn(
                  { err: error, conversationId: conversation.id, agentRunId: run.agentRunId },
                  'AI confirmation narration usage event could not be recorded'
                )
              }
              narrationContent =
                narration.stopReason === 'stop'
                  ? narration.content
                      .filter((part) => part.type === 'text')
                      .map((part) => part.text)
                      .join(' ')
                      .replace(/\s+/g, ' ')
                      .trim()
                      .slice(0, 240)
                  : ''
              if (narrationContent) {
                assistantContent = narrationContent
                await emit('delta', { content: narrationContent })
                await persistAssistantMessage()
              }
            } catch (error) {
              if (input.signal.aborted) throw error
              logger.warn(
                { err: error, conversationId: conversation.id, agentRunId: run.agentRunId },
                'AI confirmation narration could not be generated'
              )
            }
            if (!narrationContent) {
              const message = markConfirmationNarrationFailure(runtimeDetails)
              assistantContent = message
              if (run.agentRunId) {
                await failUnattachedConfirmationsWithRetry({
                  conversationId: conversation.id,
                  userId,
                  agentRunId: run.agentRunId,
                  ctx: input.ctx,
                })
              }
              await emit('delta', { content: message })
              await persistAssistantMessage()
              continue
            }
          }
          await persistAssistantMessage(true)
        }
        await emit(event.value.event, event.value.data)
        continue
      }
      if (event.source === 'queued_user_message') {
        const completedSegment = await persistAssistantMessage()
        if (completedSegment && agentRunId) {
          try {
            const confirmations = await attachAgentRunConfirmations({
              conversationId: conversation.id,
              userId,
              agentRunId,
              assistantMessageId: completedSegment.id,
            })
            attachedConfirmations.push(
              ...confirmations.map((confirmation) => ({
                ...confirmation,
                messageId: completedSegment.id,
              }))
            )
          } catch (error) {
            logger.error(
              { err: error, conversationId: conversation.id, agentRunId },
              'AI confirmation segment attachment failed'
            )
          }
        }
        assistantContent = ''
        persistedAssistantMessage = null
        lastPersistedContentLength = 0
        knowledgeCitations.clear()
        runtimeDetails.splice(0)
        await emit('assistant_segment_start', {})
        continue
      }
      if (event.source === 'message_start') {
        usage.modelCalls += 1
        continue
      }
      if (event.source === 'message_delta') {
        if (!event.value) continue
        assistantContent += event.value
        if (
          !persistedAssistantMessage ||
          assistantContent.length - lastPersistedContentLength >= 500
        ) {
          await persistAssistantMessage()
        }
        await emit('delta', { content: event.value })
        continue
      }
      if (event.source === 'message_end') {
        usage.inputTokens += event.value.inputTokens
        usage.outputTokens += event.value.outputTokens
        usage.cacheReadTokens += event.value.cacheReadTokens
        usage.cacheWriteTokens += event.value.cacheWriteTokens
        usage.totalTokens += event.value.totalTokens
        try {
          await recordAiUsageEvent({
            userId,
            conversationId: conversation.id,
            agentRunId: run.agentRunId,
            callSequence: run.nextModelCallSequence(),
            providerId: event.value.providerId,
            modelId: event.value.modelId,
            baseUrl: event.value.baseUrl,
            usage: {
              input: event.value.inputTokens,
              output: event.value.outputTokens,
              cacheRead: event.value.cacheReadTokens,
              cacheWrite: event.value.cacheWriteTokens,
              totalTokens: event.value.totalTokens,
            },
            status: event.value.error ? 'failed' : 'completed',
          })
        } catch (error) {
          logger.warn(
            { err: error, conversationId: conversation.id, agentRunId: run.agentRunId },
            'AI usage event could not be recorded'
          )
        }
        if (event.value.error) throw event.value.error
        await persistAssistantMessage()
      }
    }
    aiFailureStage = 'assistant_message_persistence'
    const assistantMessage = await persistAssistantMessage()
    if (!assistantMessage) {
      throw new Error('AI response did not contain assistant content')
    }
    aiFailureStage = 'confirmation_attachment'
    let confirmations: Awaited<ReturnType<typeof attachAgentRunConfirmations>> = []
    try {
      confirmations = await attachAgentRunConfirmations({
        conversationId: conversation.id,
        userId,
        agentRunId: run.agentRunId,
        assistantMessageId: assistantMessage.id,
      })
      attachedConfirmations.push(
        ...confirmations.map((confirmation) => ({
          ...confirmation,
          messageId: assistantMessage.id,
        }))
      )
    } catch (error) {
      logger.error(
        { err: error, conversationId: conversation.id },
        'AI confirmation attachment failed'
      )
    }

    try {
      await conversation.load('messages', (query) => query.orderBy('created_at', 'asc'))
    } catch (error) {
      logger.error({ err: error, conversationId: conversation.id }, 'AI conversation reload failed')
    }
    aiFailureStage = 'done_event_serialization'
    const previousRuns = runtimeDetails.filter((detail) => detail.kind === 'run')
    const runUsage: Record<string, unknown> = { ...usage }
    for (const previousRun of previousRuns) {
      for (const [key, value] of Object.entries(previousRun.usage)) {
        if (typeof value !== 'number') continue
        const existingValue = runUsage[key]
        runUsage[key] = (typeof existingValue === 'number' ? existingValue : 0) + value
      }
    }
    const runDetail = {
      kind: 'run',
      durationMs:
        Date.now() -
        streamStartedAt +
        previousRuns.reduce((total, previousRun) => total + previousRun.durationMs, 0),
      usage: runUsage,
    } satisfies AiChatRuntimeDetail
    runtimeDetails.splice(
      0,
      runtimeDetails.length,
      ...runtimeDetails.filter((detail) => detail.kind !== 'run'),
      runDetail
    )
    await emit('run', {
      agentRunId,
      usage: runDetail.usage,
      durationMs: runDetail.durationMs,
    })
    await persistAssistantMessage()
    await emit('done', {
      conversation: serializeAiChatConversation(conversation),
      message: serializeAiChatMessage(assistantMessage),
      confirmations: attachedConfirmations,
    })
    return assistantMessage
  } catch (error) {
    logger.error(
      { err: error, conversationId: conversation.id, agentRunId, aiFailureStage },
      'AI chat stream failed'
    )
    const message = getSafeAiErrorMessage(error)
    const hasPartialAssistantContent = Boolean(assistantContent.trim())
    // Preserve a useful partial response (for example, a confirmation
    // proposal) when a parallel stream fails during finalization. The SSE
    // error event still terminates the request, but the persisted message
    // must not duplicate it with a generic failure sentence.
    assistantContent = assistantContent.trim() ? assistantContent : message
    const failedAssistantMessage = await persistAssistantMessage()
    if (!failedAssistantMessage) {
      throw error
    }
    if (hasPartialAssistantContent) {
      let confirmations: Awaited<ReturnType<typeof attachAgentRunConfirmations>> = []
      if (agentRunId) {
        try {
          confirmations = await attachAgentRunConfirmations({
            conversationId: conversation.id,
            userId,
            agentRunId,
            assistantMessageId: failedAssistantMessage.id,
          })
          attachedConfirmations.push(
            ...confirmations.map((confirmation) => ({
              ...confirmation,
              messageId: failedAssistantMessage.id,
            }))
          )
        } catch (attachmentError) {
          logger.error(
            { err: attachmentError, conversationId: conversation.id, agentRunId },
            'AI recovered confirmation attachment failed'
          )
        }
      }
      await emit('done', {
        conversation: serializeAiChatConversation(conversation),
        message: serializeAiChatMessage(failedAssistantMessage),
        confirmations: attachedConfirmations,
      })
      if (!shouldPreserveInterruptedRun(error)) {
        try {
          await resetAiConversationState({ conversationId: conversation.id, userId })
        } catch (stateError) {
          logger.error(
            { err: stateError, conversationId: conversation.id, agentRunId },
            'AI interrupted-run cleanup failed'
          )
        }
      }
      return failedAssistantMessage
    }
    if (agentRunId) {
      // Confirmation cleanup must not prevent the streamed assistant text
      // from being retained in the conversation history. Retry transient
      // failures inline so unattached proposals do not linger indefinitely.
      await failUnattachedConfirmationsWithRetry({
        conversationId: conversation.id,
        userId,
        agentRunId,
        ctx: input.ctx,
      })
    }
    if (!shouldPreserveInterruptedRun(error)) {
      await resetAiConversationState({ conversationId: conversation.id, userId })
    }
    await emit('error', {
      message,
      assistantMessage: serializeAiChatMessage(failedAssistantMessage),
    })
    return failedAssistantMessage
  } finally {
    if (agentRunId) {
      releaseAiAgentRun(conversation.id, userId, agentRunId)
    }
    stopKeepalive?.()
  }
}
