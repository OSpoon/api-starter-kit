import { readFile } from 'node:fs/promises'

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@foadonis/openapi/decorators'

import { upsertAgentToolResult } from '#ai/agent'
import {
  createAiChatConversationTitle,
  generateAiChatConversationTitleFromImage,
} from '#ai/chat/ai_chat_conversation_title'
import { resolveAiChatRegeneration } from '#ai/chat/ai_chat_regeneration'
import { startAiChatSseKeepalive, writeAiChatSse } from '#ai/chat/ai_chat_sse_adapter'
import { resetAiConversationState } from '#ai/chat/ai_conversation_state'
import { executeAiChatConfirmationAndCreateMessage } from '#ai/chat/confirmation/ai_chat_confirmation_service'
import {
  shouldDeferConfirmationReply,
  summarizeConfirmedToolResult,
} from '#ai/chat/confirmed_tool_result_summary'
import { runAiChatAssistantTurn } from '#ai/chat/turn/ai_chat_turn_service'
import { getAiRequestTimeout } from '#ai/core/ai_agent_config'
import {
  AiAgentConfirmationError,
  cancelAiAgentAction as cancelAgentAction,
  findPendingConfirmationTool,
  listCancelledToolConfirmations,
  listConversationConfirmations,
} from '#ai/core/ai_agent_confirmation'
import {
  claimAiAgentConversation,
  getAiAgentRun,
  releaseAiAgentConversation,
} from '#ai/runtime/ai_agent_run_registry'
import AiAgentConfirmation from '#models/ai_agent_confirmation'
import AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage from '#models/ai_chat_message'
import { getAiChatImageMimeType } from '#services/ai_chat_image_service'
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
  aiChatMessageImageRouteValidator,
  createConversationValidator,
  queueAiChatMessageValidator,
  sendAiChatMessageValidator,
} from '#validators/ai_chat'
import { paginationSearchQueryValidator } from '#validators/pagination'

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
      .select([
        'id',
        'conversationId',
        'role',
        'content',
        'imageMimeType',
        'citations',
        'runtimeDetails',
        'createdAt',
        'updatedAt',
      ])
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

  @ApiBody({
    mediaType: 'multipart/form-data',
    required: true,
    schema: {
      type: 'object',
      anyOf: [{ required: ['content'] }, { required: ['image'] }],
      properties: {
        content: { type: 'string', maxLength: 8000 },
        image: { type: 'string', format: 'binary' },
        contextRoute: { type: 'string', maxLength: 200 },
        contextTitle: { type: 'string', maxLength: 160 },
      },
    },
  })
  @ApiOperation({
    summary: '发送 AI 聊天消息',
    description:
      '保存用户消息，调用 OpenAI 兼容接口，并保存助手回复。支持 JSON 文本请求或包含单张 JPEG、PNG、WebP 图片的 multipart/form-data 请求。',
  })
  @ApiResponse({
    status: 200,
    description: 'SSE 流包含 Agent 准备阶段、工具状态和不含参数值的调用摘要。',
  })
  @ApiResponse({ status: 409, description: '当前会话已有 AI 请求正在运行' })
  @ApiResponse({ status: 422, description: '消息或图片校验失败' })
  async sendMessage(ctx: HttpContext) {
    const { params, request, response } = ctx
    const user = currentUser(ctx)
    const payload = await request.validateUsing(sendAiChatMessageValidator)
    const content = payload.content?.trim() ?? ''
    const conversation = await conversationsFor(ctx, user.id).where('id', params.id).firstOrFail()
    const imageFile = request.file('image', {
      size: '2mb',
      extnames: ['jpg', 'jpeg', 'png', 'webp'],
    })

    if (imageFile && (!imageFile.isValid || !imageFile.tmpPath)) {
      return response.unprocessableEntity({
        message: imageFile.errors[0]?.message ?? '请上传不超过 2 MB 的有效图片',
      })
    }

    if (!content && !imageFile && !payload.regenerateAssistantMessageId) {
      return response.unprocessableEntity({ message: '请输入问题或附加一张图片' })
    }

    if (payload.regenerateAssistantMessageId && imageFile) {
      return response.unprocessableEntity({ message: '重新生成消息不能附带新图片' })
    }

    let imageData: Buffer | undefined
    let imageMimeType: string | undefined
    if (imageFile?.tmpPath) {
      imageData = await readFile(imageFile.tmpPath)
      imageMimeType = getAiChatImageMimeType(imageData)
      if (!imageMimeType) {
        return response.unprocessableEntity({
          message: '图片格式无效，请使用 JPEG、PNG 或 WebP 图片',
        })
      }
    }

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
          content,
          ...(imageData && imageMimeType ? { imageData, imageMimeType } : {}),
        }))

      const messageCount = await AiChatMessage.query()
        .where('conversation_id', conversation.id)
        .count('* as total')
      const isFirstMessage =
        !payload.regenerateAssistantMessageId &&
        Number(messageCount[0].$extras.total) === 1 &&
        conversation.title === 'New chat'
      const shouldGenerateImageTitle = isFirstMessage && Boolean(imageData && imageMimeType)
      if (isFirstMessage && !shouldGenerateImageTitle) {
        conversation.title = createAiChatConversationTitle(content)
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
        if (shouldGenerateImageTitle && imageData && imageMimeType) {
          const stopTitleKeepalive = startAiChatSseKeepalive(response)
          try {
            conversation.title =
              (await generateAiChatConversationTitleFromImage({
                content,
                imageData,
                imageMimeType,
                userId: user.id,
                conversationId: conversation.id,
                pageTitle: payload.contextTitle,
                signal: abortController.signal,
              })) || createAiChatConversationTitle(content || payload.contextTitle || '图片提问')
          } catch (error) {
            logger.warn(
              { err: error, conversationId: conversation.id },
              'AI chat image title generation failed'
            )
            conversation.title = createAiChatConversationTitle(
              content || payload.contextTitle || '图片提问'
            )
          } finally {
            stopTitleKeepalive()
          }
          await conversation.save()
        }

        await runAiChatAssistantTurn({
          conversation,
          userId: user.id,
          userMessage,
          regeneration,
          context:
            payload.context ??
            (payload.contextRoute && payload.contextTitle
              ? { route: payload.contextRoute, title: payload.contextTitle }
              : undefined),
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

  @ApiOperation({ summary: '获取 AI 聊天图片附件' })
  @ApiResponse({ status: 200, description: '图片二进制数据' })
  @ApiResponse({ status: 404, description: '图片不存在或不属于当前会话' })
  async showMessageImage(ctx: HttpContext) {
    const { params, request, response } = ctx
    const user = currentUser(ctx)
    const route = await request.validateUsing(aiChatMessageImageRouteValidator, { data: params })
    const conversation = await conversationsFor(ctx, user.id).where('id', route.id).firstOrFail()
    const message = await AiChatMessage.query()
      .where('conversation_id', conversation.id)
      .where('id', route.messageId)
      .firstOrFail()

    if (!message.imageData || !message.imageMimeType) {
      return response.notFound()
    }

    response.header('Content-Type', message.imageMimeType)
    response.header('Content-Disposition', 'inline')
    response.header('X-Content-Type-Options', 'nosniff')
    response.header('Cache-Control', 'private, no-store')
    return response.send(message.imageData)
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
      const { confirmation, message, isToolAction } =
        await executeAiChatConfirmationAndCreateMessage({
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
    if (!claimAiAgentConversation(conversation.id, user.id)) {
      return response.conflict({ message: '当前会话已有 AI 请求正在运行，请稍后再试' })
    }

    try {
      const pending = await AiAgentConfirmation.query()
        .where('id', route.confirmationId)
        .where('conversation_id', conversation.id)
        .where('requested_by_user_id', user.id)
        .first()
      const confirmation = await cancelAgentAction(ctx, {
        confirmationId: Number(route.confirmationId),
        conversationId: conversation.id,
        userId: user.id,
        source: 'api',
      })
      if (pending?.assistantMessageId && pending.action === 'call_builtin_tool') {
        const assistantMessage = await AiChatMessage.find(pending.assistantMessageId)
        if (assistantMessage) {
          const pendingTool = findPendingConfirmationTool(
            assistantMessage.runtimeDetails,
            Number(route.confirmationId),
            pending.action
          )
          const toolCallId =
            (pendingTool?.kind === 'tool' ? pendingTool.callId : undefined) ??
            `confirmation-${route.confirmationId}`
          assistantMessage.agentContext = upsertAgentToolResult(assistantMessage.agentContext, {
            assistantMessageId: assistantMessage.id,
            toolCallId,
            toolName:
              (pendingTool?.kind === 'tool' ? pendingTool.name : undefined) ?? pending.action,
            text: 'The user cancelled this proposed operation; it was not executed.',
            isError: true,
          })
          await assistantMessage.save()
          const pendingConfirmations = await listConversationConfirmations(conversation.id, user.id)
          if (!shouldDeferConfirmationReply(pendingConfirmations, assistantMessage.id)) {
            const cancelledConfirmations = await listCancelledToolConfirmations({
              assistantMessageId: assistantMessage.id,
              conversationId: conversation.id,
              userId: user.id,
            })
            try {
              await summarizeConfirmedToolResult({
                ctx,
                conversation,
                assistantMessage,
                userId: user.id,
                continueWithConfiguredTools: false,
                confirmationBatchResolved: true,
                resolutions: cancelledConfirmations.map((item) => ({
                  action: item.action,
                  targetSummary: item.targetSummary ?? undefined,
                })),
              })
            } catch (error) {
              logger.warn(
                {
                  err: error,
                  confirmationId: route.confirmationId,
                  conversationId: conversation.id,
                },
                'Cancelled tool continuation could not be completed'
              )
            }
          }
        }
      }
      return serialize(confirmation)
    } catch (error) {
      if (error instanceof AiAgentConfirmationError) {
        if (error.status === 404) return response.notFound({ message: error.message })
        if (error.status === 409) return response.conflict({ message: error.message })
        if (error.status === 403) return response.forbidden({ message: error.message })
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    } finally {
      releaseAiAgentConversation(conversation.id, user.id)
    }
  }

  @ApiOperation({
    summary: '流式确认 AI 代理受控操作',
    description: '执行当前用户创建且尚未过期的受控操作，并通过 SSE 流式返回助手结果。',
  })
  @ApiResponse({
    status: 200,
    description: 'SSE 流返回助手文本、工具执行状态和安全摘要。',
  })
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
      await executeAiChatConfirmationAndCreateMessage({
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
