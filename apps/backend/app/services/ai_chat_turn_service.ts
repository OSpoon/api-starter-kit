import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'

import type AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage, { type AiChatCitation } from '#models/ai_chat_message'
import { hasAiAgentCheckpoint } from '#services/ai_agent_checkpoint'
import {
  attachAgentRunConfirmations,
  failUnattachedAgentRunConfirmations,
} from '#services/ai_agent_confirmation'
import { type AiAgentPageContext, createAiAgentStream } from '#services/ai_agent_service'
import type { AiChatResolvedRegeneration } from '#services/ai_chat_regeneration'
import {
  type AiAgentToolFrame,
  startAiChatSseKeepalive,
  streamAiAgentToolFrames,
  writeAiChatSse,
} from '#services/ai_chat_sse_adapter'
import { resetAiConversationState } from '#services/ai_conversation_state'
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

type AiAgentRun = Awaited<ReturnType<typeof createAiAgentStream>>

async function* resilientAiAgentToolFrames(
  run: AiAgentRun,
  signal: AbortSignal
): AsyncGenerator<AiAgentToolFrame> {
  try {
    yield* streamAiAgentToolFrames(run, signal)
  } catch (error) {
    if (isAbortError(error)) throw error
    logger.error({ err: error }, 'AI tool status stream failed; continuing with message stream')
  }
}

async function* mergeTurnSources<TMessage, TFrame>(
  messageSource: AsyncIterable<TMessage>,
  frameSource: AsyncIterable<TFrame>
): AsyncGenerator<{ source: 'message'; value: TMessage } | { source: 'frame'; value: TFrame }> {
  const messageIterator = messageSource[Symbol.asyncIterator]()
  const frameIterator = frameSource[Symbol.asyncIterator]()
  const pending = new Map<
    AsyncIterator<unknown>,
    Promise<{ iterator: AsyncIterator<unknown>; result: IteratorResult<unknown> }>
  >()
  const pull = (iterator: AsyncIterator<unknown>) => {
    const promise = iterator.next().then(
      (result) => ({ iterator, result }),
      (error) => {
        pending.delete(iterator)
        throw error
      }
    )
    pending.set(iterator, promise)
    return promise
  }
  pull(messageIterator)
  pull(frameIterator)
  try {
    while (pending.size > 0) {
      const { iterator, result } = await Promise.race(pending.values())
      pending.delete(iterator)
      if (result.done) continue
      if (iterator === messageIterator) {
        yield { source: 'message', value: result.value as TMessage }
      } else {
        yield { source: 'frame', value: result.value as TFrame }
      }
      pull(iterator)
    }
  } finally {
    for (const iterator of [messageIterator, frameIterator]) {
      await iterator.return?.()
    }
  }
}

function getSafeAiErrorMessage(error: unknown) {
  if (isAbortError(error)) return '已停止生成本次回复。'
  return '本次 AI 请求未完成，请稍后重试。'
}

export function shouldPreserveAiAgentCheckpoint(error: unknown) {
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
  response: HttpContext['response']
  ctx: HttpContext
}) {
  const { conversation, userId, userMessage, regeneration, response } = input
  let assistantContent = ''
  let agentRunId: string | null = null
  let persistedAssistantMessage: AiChatMessage | null = null
  let lastPersistedContentLength = 0
  const knowledgeCitations = new Map<string, AiChatCitation>()
  let aiFailureStage = 'initialization'

  const persistAssistantMessage = async () => {
    if (!assistantContent.trim()) return null

    const attributes = {
      content: assistantContent,
      citations: [...knowledgeCitations.values()],
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
    stopKeepalive = startAiChatSseKeepalive(response)
    writeAiChatSse(response, 'user', {
      conversation: serializeAiChatConversation(conversation),
      message: serializeAiChatMessage(userMessage),
    })

    const regenerate = regeneration !== null
    const hasCheckpoint = await hasAiAgentCheckpoint({
      conversationId: conversation.id,
      userId,
    })
    if (!regenerate && !hasCheckpoint) {
      await conversation.load('messages', (query) => query.orderBy('created_at', 'asc'))
    }

    const history = regenerate
      ? regeneration.messages.map((message) => ({
          role: message.role,
          content: message.content,
        }))
      : hasCheckpoint
        ? [{ role: userMessage.role, content: userMessage.content }]
        : [
            ...conversation.messages
              .filter((message) => message.id !== userMessage.id)
              .map((message) => ({
                role: message.role,
                content: message.content,
              })),
            { role: userMessage.role, content: userMessage.content },
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
        writeAiChatSse(response, 'agent_citations', {
          citations: [...knowledgeCitations.values()],
        })
      },
    })
    agentRunId = run.agentRunId
    const streamStartedAt = Date.now()
    const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, modelCalls: 0 }
    const frameSource = resilientAiAgentToolFrames(run, input.signal)

    // Single relay over the two projections of the same Agent run stream.
    // Consuming messages and tool frames in arrival order keeps the UI and
    // persistence steps deterministic without two concurrent iterators over
    // one event log. A tool-status failure only ends the auxiliary status
    // stream; message deltas and citations still complete the turn.
    aiFailureStage = 'message_stream'
    for await (const event of mergeTurnSources(run.stream.messages, frameSource)) {
      if (input.signal.aborted) {
        throw new DOMException('AI request was cancelled', 'AbortError')
      }
      if (event.source === 'frame') {
        if (event.value.event === 'tool_completed') {
          continue
        }
        writeAiChatSse(response, event.value.event, event.value.data)
        continue
      }
      const message = event.value
      usage.modelCalls += 1
      for await (const delta of message.text) {
        if (!delta) {
          continue
        }

        assistantContent += delta
        // Create the assistant record as soon as content starts arriving,
        // then checkpoint substantial progress. This keeps history durable
        // when an upstream streaming connection closes before completion.
        if (
          !persistedAssistantMessage ||
          assistantContent.length - lastPersistedContentLength >= 500
        ) {
          await persistAssistantMessage()
        }
        writeAiChatSse(response, 'delta', { content: delta })
      }
      try {
        const modelOutput = await message.output
        const messageUsage = modelOutput.usage_metadata
        if (messageUsage) {
          usage.inputTokens += messageUsage.input_tokens ?? 0
          usage.outputTokens += messageUsage.output_tokens ?? 0
          usage.totalTokens += messageUsage.total_tokens ?? 0
        }
      } catch {
        // A provider that fails to assemble the message must not abort the run.
      }
      // The text stream can finish before the tool-status stream. Persist it
      // now so a later status-stream failure cannot leave only the user's
      // question in conversation history.
      await persistAssistantMessage()
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
    writeAiChatSse(response, 'run', {
      agentRunId,
      usage,
      durationMs: Date.now() - streamStartedAt,
    })
    writeAiChatSse(response, 'done', {
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
      writeAiChatSse(response, 'done', {
        conversation: serializeAiChatConversationWithMessages(conversation),
        message: serializeAiChatMessage(failedAssistantMessage),
        confirmations,
      })
      if (!shouldPreserveAiAgentCheckpoint(error)) {
        try {
          await resetAiConversationState({ conversationId: conversation.id, userId })
        } catch (stateError) {
          logger.error(
            { err: stateError, conversationId: conversation.id, agentRunId },
            'AI recovered checkpoint cleanup failed'
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
    if (!shouldPreserveAiAgentCheckpoint(error)) {
      await resetAiConversationState({ conversationId: conversation.id, userId })
    }
    writeAiChatSse(response, 'error', {
      message,
      assistantMessage: serializeAiChatMessage(failedAssistantMessage),
    })
  } finally {
    stopKeepalive?.()
  }
}
