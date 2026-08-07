import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage from '#models/ai_chat_message'
import {
  AiAgentConfirmationError,
  confirmAiAgentAction as executeAiAgentAction,
  listConversationConfirmations,
} from '#services/ai_agent_confirmation'
import { getAiRequestTimeout } from '#services/ai_agent_service'
import { resolveAiChatRegeneration } from '#services/ai_chat_regeneration'
import { runAiChatAssistantTurn } from '#services/ai_chat_turn_service'
import { resetAiConversationState } from '#services/ai_conversation_state'
import {
  serializeAiChatConversation,
  serializeAiChatConversationWithMessages,
} from '#transformers/ai_chat_transformer'
import { createConversationValidator, sendAiChatMessageValidator } from '#validators/ai_chat'

function createTitle(content: string) {
  const title = content.replace(/\s+/g, ' ').trim()
  return title.length > 60 ? `${title.slice(0, 57)}...` : title || 'New chat'
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
    const requestTimeout = setTimeout(() => abortController.abort(), getAiRequestTimeout())

    try {
      await runAiChatAssistantTurn({
        conversation,
        userId: user.id,
        userMessage,
        regeneration,
        context: payload.context,
        signal: abortController.signal,
        response,
        ctx,
      })
    } finally {
      clearTimeout(requestTimeout)
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
