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
import { releaseAiAgentRun } from '#ai/runtime/ai_agent_run_registry'
import type AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage, {
  type AiChatCitation,
  type AiChatRuntimeDetail,
} from '#models/ai_chat_message'
import {
  serializeAiChatConversation,
  serializeAiChatConversationWithMessages,
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

function getTerminalToolAssistantContent(output: unknown) {
  if (!output || typeof output !== 'object' || !('kind' in output)) return null
  const payload = output as { kind?: unknown; message?: unknown }
  if (payload.kind === 'confirmation') return '已准备好管理操作提案，请在确认卡片中确认后执行。'
  if (payload.kind === 'action_error' || payload.kind === 'query_error') {
    return typeof payload.message === 'string' ? `操作未完成：${payload.message}` : '操作未完成。'
  }
  return null
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
  regeneration: AiChatResolvedRegeneration<AiChatMessage> | null
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
  let assistantContent = ''
  let agentRunId: string | null = null
  let persistedAssistantMessage: AiChatMessage | null = null
  let lastPersistedContentLength = 0
  const knowledgeCitations = new Map<string, AiChatCitation>()
  const runtimeDetails: AiChatRuntimeDetail[] = []
  let aiFailureStage = 'initialization'

  const persistAssistantMessage = async () => {
    if (!assistantContent.trim()) return null

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
    emit('user', {
      conversation: serializeAiChatConversation(conversation),
      message: serializeAiChatMessage(userMessage),
    })

    const regenerate = regeneration !== null
    if (!regenerate) {
      await conversation.load('messages', (query) => query.orderBy('created_at', 'asc'))
    }

    const history = regenerate
      ? regeneration.messages.map((message) => ({
          role: message.role,
          content: message.content,
          id: message.id,
        }))
      : [
          ...conversation.messages
            .filter((message) => message.id !== userMessage.id)
            .map((message) => ({
              role: message.role,
              content: message.content,
              id: message.id,
            })),
          { role: userMessage.role, content: userMessage.content, id: userMessage.id },
        ]
    aiFailureStage = 'agent_stream'
    const run = await createAiAgentStream({
      conversationId: conversation.id,
      userId,
      messages: history,
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
    })
    agentRunId = run.agentRunId
    const streamStartedAt = Date.now()
    const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, modelCalls: 0 }
    aiFailureStage = 'message_stream'
    for await (const event of streamAiAgentTurnEvents(run, input.signal)) {
      if (input.signal.aborted) {
        throw new DOMException('AI request was cancelled', 'AbortError')
      }
      if (event.source === 'frame') {
        if (event.value.event === 'agent_status') {
          const status = event.value.data
          const detail: AiChatRuntimeDetail = {
            kind: 'tool',
            name: status.name,
            state: status.state,
            ...(status.callId ? { callId: status.callId } : {}),
            ...(status.durationMs !== undefined ? { durationMs: status.durationMs } : {}),
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
          const terminalContent = getTerminalToolAssistantContent(event.value.data.output)
          if (terminalContent) {
            const visibleContent = assistantContent.trim()
              ? `\n\n${terminalContent}`
              : terminalContent
            assistantContent += visibleContent
            await emit('delta', { content: visibleContent })
            await persistAssistantMessage()
          }
          continue
        }
        await emit(event.value.event, event.value.data)
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
        if (event.value.error) throw event.value.error
        usage.inputTokens += event.value.inputTokens
        usage.outputTokens += event.value.outputTokens
        usage.totalTokens += event.value.totalTokens
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
    await emit('run', {
      agentRunId,
      usage,
      durationMs: Date.now() - streamStartedAt,
    })
    runtimeDetails.push({
      kind: 'run',
      durationMs: Date.now() - streamStartedAt,
      usage,
    })
    await persistAssistantMessage()
    await emit('done', {
      conversation: serializeAiChatConversationWithMessages(conversation),
      message: serializeAiChatMessage(assistantMessage),
      confirmations,
    })
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
        } catch (attachmentError) {
          logger.error(
            { err: attachmentError, conversationId: conversation.id, agentRunId },
            'AI recovered confirmation attachment failed'
          )
        }
      }
      await emit('done', {
        conversation: serializeAiChatConversationWithMessages(conversation),
        message: serializeAiChatMessage(failedAssistantMessage),
        confirmations,
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
      return
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
  } finally {
    if (agentRunId) {
      releaseAiAgentRun(conversation.id, userId, agentRunId)
    }
    stopKeepalive?.()
  }
}
