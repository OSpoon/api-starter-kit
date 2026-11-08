import crypto from 'node:crypto'

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import type { AgentMessage } from '@earendil-works/pi-agent-core'

import { type AiAgentPageContext, createAiAgentStream } from '#ai/chat/ai_agent_service'
import type { AiChatResolvedRegeneration } from '#ai/chat/ai_chat_regeneration'
import {
  startAiChatSseKeepalive,
  streamAiAgentTurnEvents,
  writeAiChatSse,
} from '#ai/chat/ai_chat_sse_adapter'
import { resetAiConversationState } from '#ai/chat/ai_conversation_state'
import { buildAiChatTurnContext } from '#ai/chat/turn/ai_chat_turn_context'
import type { AiChatTurnEvent, AiChatTurnEventMap } from '#ai/chat/turn/ai_chat_turn_events'
import {
  failUnattachedConfirmationsWithRetry,
  getSafeAiErrorMessage,
  shouldPreserveInterruptedRun,
} from '#ai/chat/turn/ai_chat_turn_recovery'
import { attachAgentRunConfirmations } from '#ai/core/ai_agent_confirmation'
import {
  isAiAgentReadTool,
  isRecoverableAiAgentReadToolError,
  maxConsecutiveAiAgentReadToolFailures,
  sanitizeAiAgentToolErrorMessage,
} from '#ai/core/ai_agent_tool_errors'
import { releaseAiAgentRun } from '#ai/runtime/ai_agent_run_registry'
import {
  createAiAgentFinalResponseContext,
  snapshotAiAgentSessionContext,
} from '#ai/runtime/ai_agent_session_context'
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
  onEvent?: (event: AiChatTurnEvent) => void | Promise<void>
}) {
  const { conversation, userId, userMessage, regeneration, response } = input
  const runtimePhaseId = crypto.randomBytes(6).toString('hex')
  const emit = async <Event extends keyof AiChatTurnEventMap>(
    event: Event,
    data: AiChatTurnEventMap[Event]
  ) => {
    if (response) writeAiChatSse(response, event, data)
    return input.onEvent?.({ event, data } as AiChatTurnEvent)
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
  const runtimeTurn =
    runtimeDetails.filter((item) => item.kind === 'phase' && item.name === 'preparing_agent')
      .length + 1
  let consecutiveReadToolFailures = 0
  let toolActivity = false
  const isChannelTurn =
    input.capabilityMode === 'channel' || input.capabilityMode === 'knowledge-only'
  const captureModelText = input.enabledToolNames?.length !== 0
  let pendingConfirmation = false
  let queuedUserMessage = false
  let modelResponseIndex = 0
  let activeModelResponse: { callId: string; startedAt: number } | undefined
  const pendingModelText = new Map<string, string>()
  let pendingAssistantCandidate = ''
  const attachedConfirmations: Array<
    Awaited<ReturnType<typeof attachAgentRunConfirmations>>[number] & { messageId: number }
  > = []
  let aiFailureStage = 'initialization'

  const emitRuntimePhase = async (phase: {
    name: 'preparing_agent' | 'model_response'
    state: 'running' | 'done' | 'error'
    callId: string
    startedAt: number
    durationMs?: number
    serverName?: string
    toolCount?: number
    tools?: Array<{ name: string; mode?: 'read' | 'confirm' }>
    outcome?: 'tool_call' | 'final_response'
  }) => {
    const detail: AiChatRuntimeDetail = { kind: 'phase', ...phase }
    const existingIndex = runtimeDetails.findIndex(
      (item) => item.kind === 'phase' && item.callId === phase.callId
    )
    if (existingIndex >= 0) runtimeDetails[existingIndex] = detail
    else runtimeDetails.push(detail)
    await emit('agent_phase', phase)
  }

  const startModelResponse = async () => {
    modelResponseIndex += 1
    activeModelResponse = {
      callId: `${runtimePhaseId}:r${modelResponseIndex}`,
      startedAt: Date.now(),
    }
    await emitRuntimePhase({ name: 'model_response', ...activeModelResponse, state: 'running' })
  }

  const finishModelResponse = async (
    state: 'done' | 'error',
    outcome?: 'tool_call' | 'final_response'
  ) => {
    if (!activeModelResponse) return
    const finishedAt = Date.now()
    const phase = {
      name: 'model_response',
      ...activeModelResponse,
      state,
      durationMs: finishedAt - activeModelResponse.startedAt,
      ...(outcome ? { outcome } : {}),
    } as const
    if (outcome === 'final_response') {
      const phaseIndex = runtimeDetails.findIndex(
        (item) => item.kind === 'phase' && item.callId === activeModelResponse?.callId
      )
      if (phaseIndex >= 0) runtimeDetails.splice(phaseIndex, 1)
      await emit('agent_phase', phase)
    } else {
      await emitRuntimePhase(phase)
    }
    activeModelResponse = undefined
  }

  const updateModelTextDetail = async (
    callId: string,
    text: string,
    streaming: boolean,
    append = false
  ) => {
    if (!append && !text.trim()) return
    const existingIndex = runtimeDetails.findIndex(
      (item) => item.kind === 'model_text' && item.callId === callId
    )
    const previousText =
      existingIndex >= 0 && runtimeDetails[existingIndex]?.kind === 'model_text'
        ? runtimeDetails[existingIndex].text
        : ''
    const detail: AiChatRuntimeDetail = {
      kind: 'model_text',
      callId,
      text: append ? previousText + text : text,
    }
    if (existingIndex >= 0) runtimeDetails[existingIndex] = detail
    else runtimeDetails.push(detail)
    await emit('agent_model_text', { callId, text, streaming, append })
  }

  const removeModelTextDetail = async (callId: string) => {
    const existingIndex = runtimeDetails.findIndex(
      (item) => item.kind === 'model_text' && item.callId === callId
    )
    if (existingIndex >= 0) {
      runtimeDetails.splice(existingIndex, 1)
      await emit('agent_model_text_clear', { callId })
    }
  }

  const flushModelTextToDetails = async () => {
    for (const [callId, text] of pendingModelText) {
      if (!text.trim()) continue
      await updateModelTextDetail(callId, text, false)
    }
    if (pendingModelText.size) await persistAssistantMessage(true)
    pendingModelText.clear()
  }

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

    const { history, agentContext } = await buildAiChatTurnContext({
      conversation,
      userMessage,
      regeneration,
    })
    const usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      modelCalls: 0,
    }
    aiFailureStage = 'agent_stream'
    const streamStartedAt = Date.now()
    const preparationStartedAt = Date.now()
    await emitRuntimePhase({
      name: 'preparing_agent',
      callId: `${runtimePhaseId}:p`,
      state: 'running',
      startedAt: preparationStartedAt,
    })
    let run: Awaited<ReturnType<typeof createAiAgentStream>>
    try {
      run = await createAiAgentStream({
        conversationId: conversation.id,
        userId,
        auditContext: input.ctx,
        messages: history,
        agentContext,
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
    } catch (error) {
      await emitRuntimePhase({
        name: 'preparing_agent',
        callId: `${runtimePhaseId}:p`,
        state: 'error',
        startedAt: preparationStartedAt,
        durationMs: Date.now() - preparationStartedAt,
      })
      throw error
    }
    await emitRuntimePhase({
      name: 'preparing_agent',
      callId: `${runtimePhaseId}:p`,
      state: 'done',
      startedAt: preparationStartedAt,
      durationMs: Date.now() - preparationStartedAt,
    })
    agentRunId = run.agentRunId
    let sessionRun = run
    aiFailureStage = 'message_stream'
    for await (const event of streamAiAgentTurnEvents(
      run,
      input.signal,
      input.enabledToolNames?.length === 0
        ? { streamText: true }
        : {
            captureModelText: true,
            streamTextAfterToolExecution: true,
          }
    )) {
      if (input.signal.aborted) {
        throw new DOMException('AI request was cancelled', 'AbortError')
      }
      if (event.source === 'frame') {
        if (event.value.event === 'agent_status') {
          const status = event.value.data
          if (status.state === 'running') {
            toolActivity = true
            if (isChannelTurn) {
              await emit('channel_progress', { content: '正在执行工具…' })
            }
          } else if (isChannelTurn) {
            await emit('channel_progress', { content: '正在整理结果…' })
          }
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
            ...(status.startedAt !== undefined ? { startedAt: status.startedAt } : {}),
            ...(status.displayName ? { displayName: status.displayName } : {}),
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
          const planType = event.value.data.planType ?? 'confirmation'
          const planDetail: AiChatRuntimeDetail = {
            kind: 'plan',
            turn: runtimeTurn,
            planType,
            steps: event.value.data.steps.map((step) => ({ ...step })),
          }
          const existingIndex = runtimeDetails.findIndex(
            (item) =>
              item.kind === 'plan' &&
              (item.planType ?? 'confirmation') === planType &&
              (item.turn === runtimeTurn || (runtimeTurn === 1 && item.turn === undefined))
          )
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
          pendingConfirmation = true
          await flushModelTextToDetails()
          if (isChannelTurn) {
            await emit('channel_progress', { content: '等待确认操作…' })
          }
          await persistAssistantMessage(true)
        }
        await emit(event.value.event, event.value.data)
        continue
      }
      if (event.source === 'queued_user_message') {
        queuedUserMessage = true
        if (toolActivity && !pendingConfirmation) {
          await flushModelTextToDetails()
        }
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
        pendingModelText.clear()
        pendingAssistantCandidate = ''
        toolActivity = false
        pendingConfirmation = false
        await emit('assistant_segment_start', {})
        continue
      }
      if (event.source === 'message_start') {
        usage.modelCalls += 1
        await startModelResponse()
        continue
      }
      if (event.source === 'model_text_delta') {
        if (!event.value || !activeModelResponse) continue
        const previousText = pendingModelText.get(activeModelResponse.callId) ?? ''
        const text = `${previousText}${event.value}`
        pendingModelText.set(activeModelResponse.callId, text)
        if (isChannelTurn) {
          await emit('channel_preview', { callId: activeModelResponse.callId, text })
        } else if (text.trim()) {
          const append = Boolean(previousText.trim())
          await updateModelTextDetail(
            activeModelResponse.callId,
            append ? event.value : text,
            true,
            append
          )
        }
        continue
      }
      if (event.source === 'message_candidate_delta') {
        if (!event.value || !activeModelResponse) continue
        pendingAssistantCandidate += event.value
        if (isChannelTurn) {
          await emit('channel_candidate_delta', { content: pendingAssistantCandidate })
        } else {
          await emit('agent_candidate_delta', {
            callId: activeModelResponse.callId,
            content: event.value,
          })
        }
        continue
      }
      if (event.source === 'message_candidate_clear') {
        if (pendingAssistantCandidate && activeModelResponse) {
          if (isChannelTurn) await emit('channel_candidate_clear', {})
          else await emit('agent_candidate_clear', { callId: activeModelResponse.callId })
        }
        pendingAssistantCandidate = ''
        continue
      }
      if (event.source === 'message_delta') {
        if (!event.value) continue
        if (captureModelText && isChannelTurn) continue
        if (!captureModelText && toolActivity) continue
        if (activeModelResponse) pendingModelText.delete(activeModelResponse.callId)
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
        const modelCallId = activeModelResponse?.callId
        const streamedModelText = modelCallId ? pendingModelText.get(modelCallId) : undefined
        const responseText = event.value.text || streamedModelText || ''
        if (isChannelTurn && event.value.hasToolCall) {
          await emit('channel_progress', { content: '正在执行工具…' })
        }
        await finishModelResponse(
          event.value.error ? 'error' : 'done',
          event.value.error ? undefined : event.value.hasToolCall ? 'tool_call' : 'final_response'
        )
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
        if (event.value.error) {
          if (captureModelText && modelCallId) {
            const partialText = pendingModelText.get(modelCallId)
            pendingModelText.delete(modelCallId)
            if (partialText) await updateModelTextDetail(modelCallId, partialText, false)
          }
          if (pendingAssistantCandidate && modelCallId) {
            assistantContent += pendingAssistantCandidate
            pendingAssistantCandidate = ''
            await emit('agent_candidate_commit', { callId: modelCallId })
            await persistAssistantMessage()
          }
          throw event.value.error
        }
        if (!event.value.hasToolCall && pendingAssistantCandidate && modelCallId) {
          assistantContent += pendingAssistantCandidate
          pendingAssistantCandidate = ''
          await emit('agent_candidate_commit', { callId: modelCallId })
        }
        if (captureModelText && modelCallId && responseText.trim() && !pendingConfirmation) {
          pendingModelText.delete(modelCallId)
          if (event.value.hasToolCall) {
            await updateModelTextDetail(modelCallId, responseText, false)
            await persistAssistantMessage(true)
          } else if (isChannelTurn) {
            await removeModelTextDetail(modelCallId)
            const separator = assistantContent.trim()
              ? assistantContent.endsWith('\n\n')
                ? ''
                : assistantContent.endsWith('\n')
                  ? '\n'
                  : '\n\n'
              : ''
            const committedText = `${separator}${responseText}`
            assistantContent += committedText
            await emit('delta', { content: committedText })
          }
        }
        if (captureModelText && modelCallId && !event.value.hasToolCall) {
          pendingModelText.delete(modelCallId)
          await removeModelTextDetail(modelCallId)
        }
        await persistAssistantMessage()
      }
    }
    if (toolActivity && !pendingConfirmation && !queuedUserMessage) {
      await flushModelTextToDetails()
    }
    if (toolActivity && !pendingConfirmation && !queuedUserMessage && !assistantContent.trim()) {
      aiFailureStage = 'final_response_agent'
      const finalizer = await createAiAgentStream({
        conversationId: conversation.id,
        userId,
        auditContext: input.ctx,
        messages: history,
        agentContext: createAiAgentFinalResponseContext(
          run.stream.getSessionMessages() as AgentMessage[],
          userMessage.id
        ),
        capabilityMode: input.capabilityMode,
        enabledToolNames: [],
        context: input.context,
        signal: input.signal,
        agentRunId: run.agentRunId,
        modelCallSequenceStart: run.getNextModelCallSequence(),
        finalResponseOnly: true,
      })
      sessionRun = finalizer
      aiFailureStage = 'final_response_stream'
      for await (const event of streamAiAgentTurnEvents(finalizer, input.signal, {
        streamText: true,
      })) {
        if (input.signal.aborted) {
          throw new DOMException('AI request was cancelled', 'AbortError')
        }
        if (event.source === 'message_start') {
          usage.modelCalls += 1
          await startModelResponse()
          continue
        }
        if (event.source === 'message_delta') {
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
          await finishModelResponse(
            event.value.error ? 'error' : 'done',
            event.value.error ? undefined : 'final_response'
          )
          usage.inputTokens += event.value.inputTokens
          usage.outputTokens += event.value.outputTokens
          usage.cacheReadTokens += event.value.cacheReadTokens
          usage.cacheWriteTokens += event.value.cacheWriteTokens
          usage.totalTokens += event.value.totalTokens
          try {
            await recordAiUsageEvent({
              userId,
              conversationId: conversation.id,
              agentRunId: finalizer.agentRunId,
              callSequence: finalizer.nextModelCallSequence(),
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
              { err: error, conversationId: conversation.id, agentRunId: finalizer.agentRunId },
              'AI usage event could not be recorded'
            )
          }
          if (event.value.error) throw event.value.error
          await persistAssistantMessage()
          continue
        }
        if (event.source === 'frame') {
          throw new Error('Tool-free final response unexpectedly emitted a tool event')
        }
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

    let chatMessages: AiChatMessage[] = []
    try {
      await conversation.load('messages', (query) => query.orderBy('created_at', 'asc'))
      chatMessages = conversation.messages
    } catch (error) {
      logger.error({ err: error, conversationId: conversation.id }, 'AI conversation reload failed')
    }
    try {
      assistantMessage.agentContext = snapshotAiAgentSessionContext(
        sessionRun.stream.getSessionMessages() as AgentMessage[],
        chatMessages,
        assistantMessage.id
      )
      await assistantMessage.save()
    } catch (error) {
      logger.warn(
        { err: error, conversationId: conversation.id, agentRunId: run.agentRunId },
        'AI agent session context could not be persisted'
      )
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
    const candidateCallId = activeModelResponse?.callId
    await finishModelResponse('error')
    if (pendingAssistantCandidate && candidateCallId) {
      assistantContent += pendingAssistantCandidate
      pendingAssistantCandidate = ''
      await emit('agent_candidate_commit', { callId: candidateCallId })
      await persistAssistantMessage()
    }
    for (const [callId, text] of pendingModelText) {
      if (text.trim()) await updateModelTextDetail(callId, text, false)
    }
    pendingModelText.clear()
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
