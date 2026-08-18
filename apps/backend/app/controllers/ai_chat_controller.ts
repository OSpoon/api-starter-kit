import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import { getAiRequestTimeout } from '#ai/ai_agent_config'
import {
  AiAgentConfirmationError,
  confirmAiAgentAction as executeAiAgentAction,
  listConversationConfirmations,
} from '#ai/ai_agent_confirmation'
import { getAiAgentRun } from '#ai/ai_agent_run_registry'
import { resolveAiChatRegeneration } from '#ai/ai_chat_regeneration'
import { runAiChatAssistantTurn } from '#ai/ai_chat_turn_service'
import { resetAiConversationState } from '#ai/ai_conversation_state'
import AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage from '#models/ai_chat_message'
import {
  serializeAiChatConversation,
  serializeAiChatConversationWithMessages,
  serializeAiChatMessage,
} from '#transformers/ai_chat_transformer'
import {
  createConversationValidator,
  queueAiChatMessageValidator,
  sendAiChatMessageValidator,
} from '#validators/ai_chat'

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
      .firstOrFail()

    const confirmations = await listConversationConfirmations(conversation.id, user.id)
    await conversation.load('messages', (query) => query.orderBy('created_at', 'asc'))
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
      .firstOrFail()

    if (payload.regenerateAssistantMessageId) {
      await conversation.load('messages', (query) => query.orderBy('created_at', 'asc'))
    }

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

    const messageCount = await AiChatMessage.query()
      .where('conversation_id', conversation.id)
      .count('* as total')
    if (
      !payload.regenerateAssistantMessageId &&
      Number(messageCount[0].$extras.total) === 1 &&
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
    summary: '向运行中的 AI Agent 注入指令',
    description: '使用 Pi 原生 steer 队列，将人工指令注入当前运行。',
  })
  @ApiResponse({ status: 200, description: '指令已排队' })
  async steer(ctx: HttpContext) {
    return this.queueAgentMessage(ctx, 'steer')
  }

  @ApiOperation({
    summary: '向 AI Agent 排队后续指令',
    description: '使用 Pi 原生 follow-up 队列，在当前运行结束后处理人工指令。',
  })
  @ApiResponse({ status: 200, description: '后续指令已排队' })
  async followUp(ctx: HttpContext) {
    return this.queueAgentMessage(ctx, 'followUp')
  }

  private async queueAgentMessage(ctx: HttpContext, mode: 'steer' | 'followUp') {
    const { auth, params, request, response, serialize } = ctx
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(queueAiChatMessageValidator)
    const conversation = await AiChatConversation.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .firstOrFail()

    const run = getAiAgentRun(conversation.id, user.id)
    if (!run) {
      return response.conflict({ message: '当前会话没有正在运行的 AI Agent' })
    }

    const userMessage = await AiChatMessage.create({
      conversationId: conversation.id,
      role: 'user',
      content: payload.content,
    })
    run.control[mode](payload.content)
    return serialize({
      queued: true,
      mode,
      agentRunId: run.agentRunId,
      message: serializeAiChatMessage(userMessage),
    })
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
