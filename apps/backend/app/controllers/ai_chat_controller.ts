import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import { resolveAiChatRegeneration } from '#ai/chat/ai_chat_regeneration'
import { startAiChatSseKeepalive, writeAiChatSse } from '#ai/chat/ai_chat_sse_adapter'
import { runAiChatAssistantTurn } from '#ai/chat/ai_chat_turn_service'
import { resetAiConversationState } from '#ai/chat/ai_conversation_state'
import { summarizeConfirmedToolResult } from '#ai/chat/confirmed_tool_result_summary'
import { getAiRequestTimeout } from '#ai/core/ai_agent_config'
import {
  AiAgentConfirmationError,
  cancelAiAgentAction as cancelAgentAction,
  confirmAiAgentAction as executeAiAgentAction,
  findPendingConfirmationTool,
  getAiAgentActionResultMessage,
  listConversationConfirmations,
} from '#ai/core/ai_agent_confirmation'
import { sanitizeAiAgentToolErrorMessage } from '#ai/core/ai_agent_tool_errors'
import {
  claimAiAgentConversation,
  getAiAgentRun,
  releaseAiAgentConversation,
} from '#ai/runtime/ai_agent_run_registry'
import AiAgentConfirmation from '#models/ai_agent_confirmation'
import AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage from '#models/ai_chat_message'
import { getAudioMimeType, transcribeAudio } from '#services/ai_speech_service'
import { getAiUsageSummary } from '#services/ai_usage_service'
import { clampLimit } from '#support/pagination'
import {
  serializeAiChatConversation,
  serializeAiChatConversationWithMessages,
  serializeAiChatMessage,
} from '#transformers/ai_chat_transformer'
import {
  aiChatConfirmationRouteValidator,
  createConversationValidator,
  queueAiChatMessageValidator,
  sendAiChatMessageValidator,
} from '#validators/ai_chat'
import { paginationSearchQueryValidator } from '#validators/pagination'

function createTitle(content: string) {
  const title = content.replace(/\s+/g, ' ').trim()
  return title.length > 60 ? `${title.slice(0, 57)}...` : title || 'New chat'
}

function getCredentialDisclosure(result: Record<string, unknown> | undefined) {
  const value = result?.credential
  if (!value || typeof value !== 'object') return null
  const credential = value as Record<string, unknown>
  if (
    (credential.kind !== 'api_key' && credential.kind !== 'password') ||
    typeof credential.value !== 'string' ||
    typeof credential.label !== 'string'
  ) {
    return null
  }
  return {
    kind: credential.kind,
    value: credential.value,
    label: credential.label,
  }
}

async function executeConfirmationAndCreateMessage(input: {
  ctx: HttpContext
  conversation: AiChatConversation
  confirmationId: number
  userId: number
  response?: HttpContext['response']
}) {
  const { ctx, conversation, confirmationId, userId, response } = input
  const confirmationRecord = await AiAgentConfirmation.query()
    .where('id', confirmationId)
    .where('conversation_id', conversation.id)
    .where('requested_by_user_id', userId)
    .first()
  if (!confirmationRecord) {
    throw new AiAgentConfirmationError('受控操作确认不存在', 404)
  }
  if (!confirmationRecord.assistantMessageId) {
    throw new AiAgentConfirmationError('找不到对应的助手消息', 409)
  }
  let assistantMessage = await AiChatMessage.query()
    .where('id', confirmationRecord.assistantMessageId)
    .where('conversation_id', conversation.id)
    .where('role', 'assistant')
    .first()
  if (!assistantMessage) {
    throw new AiAgentConfirmationError('找不到对应的助手消息', 409)
  }
  const pendingTool = findPendingConfirmationTool(
    assistantMessage.runtimeDetails,
    confirmationId,
    confirmationRecord.action
  )
  const callId = pendingTool?.kind === 'tool' ? pendingTool.callId : undefined
  const isToolAction =
    confirmationRecord.action === 'call_mcp_tool' ||
    confirmationRecord.action === 'call_builtin_tool'
  const executionName =
    isToolAction || pendingTool?.kind !== 'tool' ? 'confirmation_execution' : pendingTool.name
  const executionDetail = {
    ...(pendingTool?.kind === 'tool' ? pendingTool.detail : {}),
    confirmationId,
    ...(pendingTool?.kind === 'tool' && typeof pendingTool.detail?.toolName === 'string'
      ? { toolName: pendingTool.detail.toolName }
      : isToolAction && typeof confirmationRecord.targetSummary?.name === 'string'
        ? { toolName: confirmationRecord.targetSummary.name }
        : {}),
  }
  const activityCallId = callId ?? `confirmation-${confirmationId}`
  const actionStartedAt = Date.now()
  if (response) {
    writeAiChatSse(response, 'agent_status', {
      name: executionName,
      state: 'running',
      callId: activityCallId,
      phase: 'executing_confirmation',
      detail: executionDetail,
    })
  }
  let confirmation: Awaited<ReturnType<typeof executeAiAgentAction>>
  try {
    confirmation = await executeAiAgentAction(ctx, {
      confirmationId,
      conversationId: conversation.id,
      userId,
    })
  } catch (error) {
    if (response) {
      const errorMessage = sanitizeAiAgentToolErrorMessage(
        error instanceof Error ? error.message : undefined
      )
      writeAiChatSse(response, 'agent_status', {
        name: executionName,
        state: 'error',
        callId: activityCallId,
        durationMs: Date.now() - actionStartedAt,
        phase: 'failed',
        detail: executionDetail,
        ...(errorMessage ? { message: errorMessage } : {}),
      })
    }
    throw error
  }
  assistantMessage = await AiChatMessage.findOrFail(assistantMessage.id)
  const actionResult =
    confirmation.result && typeof confirmation.result === 'object' ? confirmation.result : undefined
  const toolName = actionResult?.mcpToolName ?? actionResult?.agentToolName

  if (response) {
    writeAiChatSse(response, 'agent_status', {
      name: executionName,
      state: 'done',
      callId: activityCallId,
      durationMs: Date.now() - actionStartedAt,
      phase: 'confirmed',
      detail: {
        ...executionDetail,
        ...(typeof toolName === 'string' ? { toolName } : {}),
      },
    })
  }

  const credential = getCredentialDisclosure(actionResult)
  if (response && credential) writeAiChatSse(response, 'credential_disclosure', { credential })

  if (isToolAction) {
    const { message } = await summarizeConfirmedToolResult({
      ctx,
      conversation,
      assistantMessage,
      userId,
      result: actionResult,
      response,
    })
    return { confirmation, actionResult, message, isToolAction }
  }

  const content = await getAiAgentActionResultMessage({
    confirmationId,
    conversationId: conversation.id,
    userId,
    result: actionResult,
  })
  const delta = `${assistantMessage.content.trim() ? '\n\n' : ''}${content}`
  assistantMessage.content += delta
  await assistantMessage.save()
  if (response) writeAiChatSse(response, 'delta', { content: delta })
  if (response) {
    writeAiChatSse(response, 'done', {
      conversation: serializeAiChatConversation(conversation),
      message: serializeAiChatMessage(assistantMessage),
      confirmations: [],
    })
  }
  return { confirmation, actionResult, message: assistantMessage, isToolAction }
}

function currentUser(ctx: HttpContext) {
  return ctx.integrationUser ?? ctx.auth.getUserOrFail()
}

function conversationsFor(ctx: HttpContext, userId: number) {
  const query = AiChatConversation.query().where('user_id', userId)
  return ctx.integrationApiKey
    ? query.where('api_key_id', ctx.integrationApiKey.id)
    : query.whereNull('api_key_id')
}

@ApiSecurity('bearerAuth')
@ApiSecurity('integrationApiKey')
export default class AiChatController {
  @ApiOperation({ summary: '转写 AI 助手语音消息' })
  @ApiResponse({ status: 200, description: '语音转写结果' })
  async transcribe(ctx: HttpContext) {
    const { request, response, serialize } = ctx
    const file = request.file('audio', {
      size: '10mb',
      extnames: ['webm', 'ogg', 'wav', 'mp3', 'm4a', 'mp4', 'mpeg', 'mpga'],
    })
    if (!file || !file.isValid || !file.tmpPath) {
      return response.unprocessableEntity({
        message: file?.errors?.[0]?.message ?? '请上传不超过 10 MB 的有效音频文件',
      })
    }
    try {
      return serialize({
        text: await transcribeAudio(
          file.tmpPath,
          file.clientName,
          getAudioMimeType(file.clientName)
        ),
      })
    } catch (error) {
      return response.unprocessableEntity({
        message: error instanceof Error ? error.message : '语音转写失败，请稍后重试',
      })
    }
  }

  @ApiOperation({
    summary: '获取 AI 会话列表',
    description: '返回当前管理员的 AI 聊天历史会话。',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: '页码，从 1 开始',
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '每页数量，默认 20，最大 100',
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiResponse({ status: 200, description: 'AI 会话列表' })
  async index(ctx: HttpContext) {
    const { request, serialize } = ctx
    const user = currentUser(ctx)
    const payload = await paginationSearchQueryValidator.validate(request.qs())
    const paginator = await conversationsFor(ctx, user.id)
      .orderBy('updated_at', 'desc')
      .orderBy('id', 'desc')
      .paginate(payload.page ?? 1, clampLimit(payload.limit, 20, 100))

    return serialize({
      items: paginator.all().map(serializeAiChatConversation),
      meta: paginator.getMeta(),
    })
  }

  @ApiOperation({
    summary: '获取当前用户的 AI 用量',
    description: '仅返回当前登录用户本月 Pi 对话模型的 token 用量和估算消费。',
  })
  @ApiResponse({ status: 200, description: '当前用户的 AI 用量汇总' })
  async usage(ctx: HttpContext) {
    const user = currentUser(ctx)
    return ctx.serialize(await getAiUsageSummary(user.id, ctx.integrationApiKey?.id))
  }

  @ApiOperation({
    summary: '创建 AI 会话',
    description: '创建一个新的纯聊天会话。',
  })
  @ApiResponse({ status: 200, description: '已创建的 AI 会话' })
  async store(ctx: HttpContext) {
    const { request, serialize } = ctx
    const user = currentUser(ctx)
    const payload = await request.validateUsing(createConversationValidator)
    const conversation = await AiChatConversation.create({
      userId: user.id,
      apiKeyId: ctx.integrationApiKey?.id ?? null,
      title: payload.title ?? 'New chat',
    })

    await conversation.load('messages', (query) => query.orderBy('created_at', 'asc'))
    return serialize(serializeAiChatConversationWithMessages(conversation))
  }

  @ApiOperation({
    summary: '获取 AI 会话详情',
    description: '返回指定会话及其消息分页，消息按时间顺序排列。',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: '消息页码，从 1 开始，第一页为最新消息',
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '每页消息数，默认 50，最大 100',
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiResponse({ status: 200, description: 'AI 会话详情和消息分页' })
  async show(ctx: HttpContext) {
    const { params, request, serialize } = ctx
    const user = currentUser(ctx)
    const payload = await paginationSearchQueryValidator.validate(request.qs())
    const conversation = await conversationsFor(ctx, user.id).where('id', params.id).firstOrFail()

    const confirmations = await listConversationConfirmations(conversation.id, user.id)
    const paginator = await AiChatMessage.query()
      .where('conversation_id', conversation.id)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .paginate(payload.page ?? 1, clampLimit(payload.limit, 50, 100))
    return serialize({
      ...serializeAiChatConversation(conversation),
      messages: paginator.all().reverse().map(serializeAiChatMessage),
      messagesMeta: paginator.getMeta(),
      confirmations,
    })
  }

  @ApiOperation({
    summary: '发送 AI 聊天消息',
    description: '保存用户消息，调用 OpenAI 兼容接口，并保存助手回复。',
  })
  @ApiResponse({ status: 200, description: '流式 AI 会话响应' })
  @ApiResponse({ status: 409, description: '当前会话已有 AI 请求正在运行' })
  async sendMessage(ctx: HttpContext) {
    const { params, request, response } = ctx
    const user = currentUser(ctx)
    const payload = await request.validateUsing(sendAiChatMessageValidator)
    const conversation = await conversationsFor(ctx, user.id).where('id', params.id).firstOrFail()

    if (!claimAiAgentConversation(conversation.id, user.id)) {
      return response.conflict({ message: '当前会话已有 AI 请求正在运行，请稍后再试' })
    }

    try {
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
      const requestTimeout = setTimeout(() => abortController.abort(), await getAiRequestTimeout())

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
    } finally {
      releaseAiAgentConversation(conversation.id, user.id)
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
    const { params, request, response, serialize } = ctx
    const user = currentUser(ctx)
    const payload = await request.validateUsing(queueAiChatMessageValidator)
    const conversation = await conversationsFor(ctx, user.id).where('id', params.id).firstOrFail()

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
    const { params, response, serialize } = ctx
    const user = currentUser(ctx)
    const conversation = await conversationsFor(ctx, user.id).where('id', params.id).firstOrFail()
    if (!claimAiAgentConversation(conversation.id, user.id)) {
      return response.conflict({ message: '当前会话已有 AI 请求正在运行，请稍后再试' })
    }

    try {
      const { confirmation, message, isToolAction } = await executeConfirmationAndCreateMessage({
        ctx,
        conversation,
        confirmationId: Number(params.confirmationId),
        userId: user.id,
      })
      const confirmationSummary = { ...confirmation }
      if (isToolAction) delete confirmationSummary.result
      return serialize({
        ...confirmationSummary,
        message: serializeAiChatMessage(message),
      })
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
    } finally {
      releaseAiAgentConversation(conversation.id, user.id)
    }
  }

  @ApiOperation({
    summary: '取消 AI 代理受控操作',
    description: '取消当前用户在 AI 对话中创建且尚未执行的受控操作。',
  })
  @ApiResponse({ status: 200, description: '受控操作已取消' })
  async cancelAiAgentAction(ctx: HttpContext) {
    const { params, request, response, serialize } = ctx
    const route = await request.validateUsing(aiChatConfirmationRouteValidator, { data: params })
    const user = currentUser(ctx)
    const conversation = await conversationsFor(ctx, user.id).where('id', route.id).firstOrFail()

    try {
      const confirmation = await cancelAgentAction(ctx, {
        confirmationId: Number(route.confirmationId),
        conversationId: conversation.id,
        userId: user.id,
        source: 'api',
      })
      return serialize(confirmation)
    } catch (error) {
      if (error instanceof AiAgentConfirmationError) {
        if (error.status === 404) return response.notFound({ message: error.message })
        if (error.status === 409) return response.conflict({ message: error.message })
        if (error.status === 403) return response.forbidden({ message: error.message })
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
  }

  @ApiOperation({
    summary: '流式确认 AI 代理受控操作',
    description: '执行当前用户创建且尚未过期的受控操作，并通过 SSE 流式返回助手结果。',
  })
  @ApiResponse({ status: 200, description: 'SSE 流返回助手文本和执行状态' })
  async confirmAiAgentActionStream(ctx: HttpContext) {
    const { params, response } = ctx
    const user = currentUser(ctx)
    const conversation = await conversationsFor(ctx, user.id).where('id', params.id).firstOrFail()
    if (!claimAiAgentConversation(conversation.id, user.id)) {
      return response.conflict({ message: '当前会话已有 AI 请求正在运行，请稍后再试' })
    }

    response.header('Content-Type', 'text/event-stream; charset=utf-8')
    response.header('Cache-Control', 'no-cache, no-transform')
    response.header('Connection', 'keep-alive')
    response.header('X-Accel-Buffering', 'no')
    response.writeHead(200)
    const stopKeepalive = startAiChatSseKeepalive(response)
    try {
      await executeConfirmationAndCreateMessage({
        ctx,
        conversation,
        confirmationId: Number(params.confirmationId),
        userId: user.id,
        response,
      })
    } catch (error) {
      const message =
        error instanceof AiAgentConfirmationError ? error.message : '确认操作未完成，请稍后重试。'
      if (!(error instanceof AiAgentConfirmationError)) {
        logger.error(
          { err: error, conversationId: conversation.id, confirmationId: params.confirmationId },
          'AI confirmation stream failed'
        )
      }
      writeAiChatSse(response, 'error', { message })
    } finally {
      stopKeepalive()
      if (!response.response.writableEnded) response.response.end()
      releaseAiAgentConversation(conversation.id, user.id)
    }
  }

  @ApiOperation({
    summary: '删除 AI 会话',
    description: '删除指定 AI 会话及其历史消息。',
  })
  @ApiResponse({ status: 200, description: '删除结果' })
  async destroy(ctx: HttpContext) {
    const { params, serialize } = ctx
    const user = currentUser(ctx)
    const conversation = await conversationsFor(ctx, user.id).where('id', params.id).firstOrFail()

    await resetAiConversationState({ conversationId: conversation.id, userId: user.id })
    await conversation.delete()
    return serialize({ id: Number(params.id), deleted: true })
  }
}
