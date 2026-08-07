import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage, { type AiChatCitation } from '#models/ai_chat_message'
import {
  AiAgentConfirmationError,
  attachAgentRunConfirmations,
  confirmAiAgentAction as executeAiAgentAction,
  failUnattachedAgentRunConfirmations,
  listConversationConfirmations,
} from '#services/ai_agent_confirmation'
import { resolveGroundedAssistantResponse } from '#services/ai_agent_response_policy'
import { createAiAgentStream, getAiRequestTimeout } from '#services/ai_agent_service'
import { resolveAiChatRegeneration } from '#services/ai_chat_regeneration'
import {
  startAiChatSseKeepalive,
  streamAiAgentToolStatuses,
  writeAiChatSse,
} from '#services/ai_chat_sse_adapter'
import { resetAiConversationState } from '#services/ai_conversation_state'
import {
  serializeAiChatConversation,
  serializeAiChatConversationWithMessages,
  serializeAiChatMessage,
} from '#transformers/ai_chat_transformer'
import { createConversationValidator, sendAiChatMessageValidator } from '#validators/ai_chat'

function createTitle(content: string) {
  const title = content.replace(/\s+/g, ' ').trim()
  return title.length > 60 ? `${title.slice(0, 57)}...` : title || 'New chat'
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function getSafeAiErrorMessage(error: unknown) {
  if (isAbortError(error)) return '已停止生成本次回复。'
  return '本次 AI 请求未完成，请稍后重试。'
}

@ApiSecurity('bearerAuth')
export default class AiChatController {
  @ApiOperation({
    summary: '获取 AI 会话列表',
    description: '返回当前管理员的 AI 聊天历史会话。',
  })
  @ApiResponse({ status: 200, description: 'AI 会话列表' })
  async index({ auth, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const conversations = await AiChatConversation.query()
      .where('user_id', user.id)
      .orderBy('updated_at', 'desc')

    return serialize(conversations.map(serializeAiChatConversation))
  }

  @ApiOperation({
    summary: '创建 AI 会话',
    description: '创建一个新的纯聊天会话。',
  })
  @ApiResponse({ status: 200, description: '已创建的 AI 会话' })
  async store({ auth, request, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(createConversationValidator)
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: payload.title ?? 'New chat',
    })

    await conversation.load('messages', (query) => query.orderBy('created_at', 'asc'))
    return serialize(serializeAiChatConversationWithMessages(conversation))
  }

  @ApiOperation({
    summary: '获取 AI 会话详情',
    description: '返回指定会话及其消息列表。',
  })
  @ApiResponse({ status: 200, description: 'AI 会话详情' })
  async show({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const conversation = await AiChatConversation.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .preload('messages', (query) => query.orderBy('created_at', 'asc'))
      .firstOrFail()

    const confirmations = await listConversationConfirmations(conversation.id, user.id)
    return serialize({ ...serializeAiChatConversationWithMessages(conversation), confirmations })
  }

  @ApiOperation({
    summary: '发送 AI 聊天消息',
    description: '保存用户消息，调用 OpenAI 兼容接口，并保存助手回复。',
  })
  @ApiResponse({ status: 200, description: '流式 AI 会话响应' })
  async sendMessage(ctx: HttpContext) {
    const { auth, params, request, response } = ctx
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(sendAiChatMessageValidator)
    const conversation = await AiChatConversation.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .preload('messages', (query) => query.orderBy('created_at', 'asc'))
      .firstOrFail()

    const regeneration = payload.regenerateAssistantMessageId
      ? resolveAiChatRegeneration(conversation.messages, payload.regenerateAssistantMessageId)
      : null

    if (payload.regenerateAssistantMessageId) {
      if (!regeneration) {
        return response.unprocessableEntity({ message: '只能重新生成当前对话的最后一条助手回复' })
      }

      await AiChatMessage.query()
        .where('id', regeneration.assistantMessage.id)
        .where('conversation_id', conversation.id)
        .delete()
      await resetAiConversationState({ conversationId: conversation.id, userId: user.id })
    }

    const userMessage =
      regeneration?.userMessage ??
      (await AiChatMessage.create({
        conversationId: conversation.id,
        role: 'user',
        content: payload.content,
      }))

    if (
      !payload.regenerateAssistantMessageId &&
      conversation.messages.length === 0 &&
      conversation.title === 'New chat'
    ) {
      conversation.title = createTitle(payload.content)
      await conversation.save()
    }

    response.header('Content-Type', 'text/event-stream; charset=utf-8')
    response.header('Cache-Control', 'no-cache, no-transform')
    response.header('Connection', 'keep-alive')
    response.header('X-Accel-Buffering', 'no')
    response.writeHead(200)
    const abortController = new AbortController()
    const abortOnDisconnect = () => abortController.abort()
    response.response.once('close', abortOnDisconnect)

    writeAiChatSse(response, 'user', {
      conversation: serializeAiChatConversation(conversation),
      message: serializeAiChatMessage(userMessage),
    })

    let assistantContent = ''
    let agentRunId: string | null = null
    let persistedAssistantMessage: AiChatMessage | null = null
    let lastPersistedContentLength = 0
    const knowledgeCitations = new Map<string, AiChatCitation>()
    const completedToolNames = new Set<string>()
    let aiFailureStage = 'initialization'
    const requestTimeout = setTimeout(() => abortController.abort(), getAiRequestTimeout())

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
      const persistedMessages = payload.regenerateAssistantMessageId
        ? regeneration!.messages
        : conversation.messages
      const history = payload.regenerateAssistantMessageId
        ? persistedMessages.map((message) => ({
            role: message.role,
            content: message.content,
          }))
        : [
            ...persistedMessages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            { role: userMessage.role, content: userMessage.content },
          ]
      aiFailureStage = 'agent_stream'
      const run = await createAiAgentStream({
        conversationId: conversation.id,
        userId: user.id,
        messages: history,
        context: payload.context,
        signal: abortController.signal,
        onKnowledgeSources: (sources) => {
          for (const source of sources) {
            knowledgeCitations.set(`${source.documentId}:${source.chunkId}`, source)
          }
          completedToolNames.add('search_knowledge')
          writeAiChatSse(response, 'agent_citations', {
            citations: [...knowledgeCitations.values()],
          })
        },
      })
      agentRunId = run.agentRunId
      let hasCompletedTool = false
      let bufferedContent = ''
      const toolStatusTask = streamAiAgentToolStatuses(
        run,
        response,
        abortController.signal,
        (_toolName, _output) => {
          hasCompletedTool = true
          if (bufferedContent) {
            writeAiChatSse(response, 'delta', { content: bufferedContent })
            bufferedContent = ''
          }
        }
      ).catch((error) => {
        // The tool-status iterator shares the Agent event stream with the
        // message iterator. Handle its rejection immediately: waiting until
        // after the message loop lets an unavailable LLM become an
        // unhandled rejection and terminate the HTTP process.
        logger.error({ err: error }, 'Tool status stream failed')
      })

      aiFailureStage = 'message_stream'
      for await (const message of run.stream.messages) {
        if (abortController.signal.aborted) {
          throw new DOMException('AI request was cancelled', 'AbortError')
        }
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
          if (hasCompletedTool) {
            writeAiChatSse(response, 'delta', { content: delta })
          } else {
            bufferedContent += delta
          }
        }
        // The text stream can finish before the parallel tool-status stream.
        // Persist it now so a later status-stream failure cannot leave only
        // the user's question in conversation history.
        await persistAssistantMessage()
      }
      aiFailureStage = 'tool_status_finalization'
      const toolResult = await toolStatusTask
      // Tool status is an auxiliary UI stream. It must not discard a complete
      // model response when that parallel iterator closes unexpectedly.
      // Knowledge retrieval is recorded independently through
      // `onKnowledgeSources`, so its citations are still persisted below.
      for (const toolName of toolResult ?? []) completedToolNames.add(toolName)
      assistantContent = resolveGroundedAssistantResponse({
        content: assistantContent,
        completedToolNames,
      })
      if (!hasCompletedTool) {
        writeAiChatSse(response, 'delta', { content: assistantContent })
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
          userId: user.id,
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
        logger.error(
          { err: error, conversationId: conversation.id },
          'AI conversation reload failed'
        )
      }
      aiFailureStage = 'done_event_serialization'
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
              userId: user.id,
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
        try {
          await resetAiConversationState({ conversationId: conversation.id, userId: user.id })
        } catch (stateError) {
          logger.error(
            { err: stateError, conversationId: conversation.id, agentRunId },
            'AI recovered checkpoint cleanup failed'
          )
        }
        return
      }
      if (agentRunId) {
        // Confirmation cleanup must not prevent the streamed assistant text
        // from being retained in the conversation history.
        try {
          await failUnattachedAgentRunConfirmations({
            conversationId: conversation.id,
            userId: user.id,
            agentRunId,
            ctx,
          })
        } catch {
          // The response was already persisted; cleanup can be retried by a
          // subsequent maintenance path without losing the conversation.
        }
      }
      await resetAiConversationState({ conversationId: conversation.id, userId: user.id })
      writeAiChatSse(response, 'error', {
        message,
        assistantMessage: serializeAiChatMessage(failedAssistantMessage),
      })
    } finally {
      clearTimeout(requestTimeout)
      stopKeepalive?.()
      response.response.off('close', abortOnDisconnect)
      response.response.end()
    }
  }

  @ApiOperation({
    summary: '确认 AI 代理受控操作',
    description: '执行当前用户在 AI 对话中创建且尚未过期的受控操作确认。',
  })
  @ApiResponse({ status: 200, description: '已执行受控操作' })
  async confirmAiAgentAction(ctx: HttpContext) {
    const { auth, params, response, serialize } = ctx
    const user = auth.getUserOrFail()
    const conversation = await AiChatConversation.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .firstOrFail()

    try {
      const confirmation = await executeAiAgentAction(ctx, {
        confirmationId: Number(params.confirmationId),
        conversationId: conversation.id,
        userId: user.id,
      })
      return serialize(confirmation)
    } catch (error) {
      if (error instanceof AiAgentConfirmationError) {
        if (error.status === 404) {
          return response.notFound({ message: error.message })
        }
        if (error.status === 409) {
          return response.conflict({ message: error.message })
        }
        if (error.status === 403) {
          return response.forbidden({ message: error.message })
        }
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
  }

  @ApiOperation({
    summary: '删除 AI 会话',
    description: '删除指定 AI 会话及其历史消息。',
  })
  @ApiResponse({ status: 200, description: '删除结果' })
  async destroy({ auth, params, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const conversation = await AiChatConversation.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .firstOrFail()

    await resetAiConversationState({ conversationId: conversation.id, userId: user.id })
    await conversation.delete()
    return serialize({ id: Number(params.id), deleted: true })
  }
}
