import { readFile, rm } from 'node:fs/promises'
import { basename } from 'node:path'

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@foadonis/openapi/decorators'

import {
  createAiChatConversationTitle,
  generateAiChatConversationTitleFromImage,
} from '#ai/chat/ai_chat_conversation_title'
import { resolveAiChatRegeneration } from '#ai/chat/ai_chat_regeneration'
import { startAiChatSseKeepalive, writeAiChatSse } from '#ai/chat/ai_chat_sse_adapter'
import { resetAiConversationState } from '#ai/chat/ai_conversation_state'
import {
  cancelAiChatConfirmationAndUpdateMessage,
  executeAiChatConfirmationAndCreateMessage,
} from '#ai/chat/confirmation/ai_chat_confirmation_service'
import { runAiChatAssistantTurn } from '#ai/chat/turn/ai_chat_turn_service'
import { getAiRequestTimeout } from '#ai/core/ai_agent_config'
import {
  AiAgentConfirmationError,
  listConversationConfirmations,
} from '#ai/core/ai_agent_confirmation'
import {
  claimAiAgentConversation,
  getAiAgentRun,
  releaseAiAgentConversation,
} from '#ai/runtime/ai_agent_run_registry'
import AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage from '#models/ai_chat_message'
import { listEnabledAiAgentSkills } from '#services/ai_agent_skill_service'
import { getAiChatImageMimeType } from '#services/ai_chat_image_service'
import { createAiChatPdfMessage } from '#services/ai_chat_pdf_service'
import { getAudioMimeType, transcribeAudio } from '#services/ai_speech_service'
import { getAiUsageSummary } from '#services/ai_usage_service'
import { getMineruToken } from '#services/mineru_configuration_service'
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

import {
  type ApiSchema,
  dataEnvelope,
  errorResponseSchema,
  paginatedDataEnvelope,
  paginationMetaSchema,
} from '../openapi/response_schemas.js'

const conversationSchema: ApiSchema = {
  type: 'object',
  required: ['id', 'title', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'integer' },
    title: { type: 'string' },
    createdAt: { type: 'string', nullable: true, format: 'date-time' },
    updatedAt: { type: 'string', nullable: true, format: 'date-time' },
  },
}

const messageSchema: ApiSchema = {
  type: 'object',
  required: ['id', 'conversationId', 'role', 'content', 'citations', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'integer' },
    conversationId: { type: 'integer' },
    role: { type: 'string', enum: ['user', 'assistant'] },
    content: { type: 'string' },
    image: { type: 'object', properties: { mimeType: { type: 'string' } } },
    pdf: { type: 'object', properties: { name: { type: 'string' } } },
    citations: { type: 'array', items: { type: 'object', additionalProperties: true } },
    timeline: { type: 'array', items: { type: 'object', additionalProperties: true } },
    createdAt: { type: 'string', nullable: true, format: 'date-time' },
    updatedAt: { type: 'string', nullable: true, format: 'date-time' },
  },
}

const confirmationSchema: ApiSchema = {
  type: 'object',
  required: [
    'id',
    'action',
    'status',
    'impact',
    'targetType',
    'targetSummary',
    'changeSummary',
    'presentation',
  ],
  properties: {
    id: { type: 'integer' },
    action: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'confirmed', 'cancelled', 'failed', 'expired'] },
    impact: { type: 'string', enum: ['read', 'write', 'destructive'] },
    targetType: { type: 'string' },
    targetId: { type: 'string', nullable: true },
    targetSummary: { type: 'object', additionalProperties: true },
    changeSummary: {
      type: 'array',
      items: {
        type: 'object',
        required: ['field', 'value'],
        properties: { field: { type: 'string' }, value: { type: 'string' } },
      },
    },
    expiresAt: { type: 'string', nullable: true, format: 'date-time' },
    presentation: { type: 'object', additionalProperties: true },
  },
}

function currentUser(ctx: HttpContext) {
  return ctx.integrationUser ?? ctx.auth.getUserOrFail()
}

function conversationsFor(ctx: HttpContext, userId: number) {
  const query = AiChatConversation.query().where('user_id', userId).whereNull('automation_run_id')
  if (!ctx.integrationApiKey) return query.whereNull('api_key_id')

  query.where('api_key_id', ctx.integrationApiKey.id)
  if (ctx.embedSessionId) query.where('embed_session_id', ctx.embedSessionId)
  else query.whereNull('embed_session_id')
  return query
}

@ApiSecurity('bearerAuth')
@ApiSecurity('integrationApiKey')
@ApiResponse({
  status: 401,
  description: 'Bearer Token 或 API Key 无效',
  schema: errorResponseSchema,
})
@ApiResponse({ status: 403, description: '请求凭据无权访问该资源', schema: errorResponseSchema })
export default class AiChatController {
  @ApiOperation({
    summary: '获取可在 AI 聊天中选择的技能',
    description: '返回当前已启用技能的代码和说明，供聊天输入框的 @ 技能选择使用。',
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
  @ApiQuery({
    name: 'search',
    required: false,
    description: '按技能代码或名称筛选',
    schema: { type: 'string', maxLength: 200 },
  })
  @ApiResponse({
    status: 200,
    description: '已启用技能分页列表',
    schema: paginatedDataEnvelope({
      type: 'object',
      required: ['code', 'name', 'description'],
      properties: {
        code: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
      },
    }),
  })
  async skills(ctx: HttpContext) {
    const { request, serialize } = ctx
    const pagination = await paginationSearchQueryValidator.validate(request.qs())
    const search = pagination.search?.toLowerCase()
    const enabledSkills = await listEnabledAiAgentSkills()
    const skills = enabledSkills.filter(
      (skill) =>
        !search ||
        skill.code.toLowerCase().includes(search) ||
        skill.name.toLowerCase().includes(search)
    )
    const limit = clampLimit(pagination.limit, 20, 100)
    const lastPage = Math.max(1, Math.ceil(skills.length / limit))
    const currentPage = Math.min(pagination.page ?? 1, lastPage)
    const offset = (currentPage - 1) * limit

    return serialize({
      items: skills
        .slice(offset, offset + limit)
        .map(({ code, name, description }) => ({ code, name, description })),
      meta: { currentPage, perPage: limit, lastPage, total: skills.length },
    })
  }

  @ApiOperation({ summary: '转写 AI 助手语音消息' })
  @ApiBody({
    mediaType: 'multipart/form-data',
    required: true,
    schema: {
      type: 'object',
      required: ['audio'],
      properties: {
        audio: {
          type: 'string',
          format: 'binary',
          description: '最大 10 MB；支持 webm、ogg、wav、mp3、m4a、mp4、mpeg、mpga。',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '语音转写文本',
    schema: dataEnvelope({
      type: 'object',
      required: ['text'],
      properties: { text: { type: 'string' } },
    }),
  })
  @ApiResponse({ status: 422, description: '音频无效或转写失败', schema: errorResponseSchema })
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
  @ApiResponse({
    status: 200,
    description: 'AI 会话分页列表',
    schema: paginatedDataEnvelope(conversationSchema),
  })
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
  @ApiResponse({
    status: 200,
    description: '当前用户本月的 AI 用量汇总',
    schema: dataEnvelope({
      type: 'object',
      required: [
        'period',
        'inputTokens',
        'outputTokens',
        'cacheReadTokens',
        'cacheWriteTokens',
        'totalTokens',
        'modelCalls',
        'estimatedCostUsd',
        'pricingSource',
        'unpricedModelCount',
        'models',
      ],
      properties: {
        period: { type: 'string', enum: ['current_month'] },
        periodStart: { type: 'string', format: 'date-time' },
        periodEnd: { type: 'string', format: 'date-time' },
        inputTokens: { type: 'integer' },
        outputTokens: { type: 'integer' },
        cacheReadTokens: { type: 'integer' },
        cacheWriteTokens: { type: 'integer' },
        totalTokens: { type: 'integer' },
        modelCalls: { type: 'integer' },
        estimatedCostUsd: { type: 'number', nullable: true },
        pricingSource: { type: 'string', enum: ['models.dev', 'mixed', 'unavailable'] },
        unpricedModelCount: { type: 'integer' },
        models: {
          type: 'array',
          items: {
            type: 'object',
            required: [
              'modelId',
              'providerId',
              'inputTokens',
              'outputTokens',
              'cacheReadTokens',
              'cacheWriteTokens',
              'totalTokens',
              'modelCalls',
              'estimatedCostUsd',
              'priced',
            ],
            properties: {
              modelId: { type: 'string' },
              providerId: { type: 'string' },
              inputTokens: { type: 'integer' },
              outputTokens: { type: 'integer' },
              cacheReadTokens: { type: 'integer' },
              cacheWriteTokens: { type: 'integer' },
              totalTokens: { type: 'integer' },
              modelCalls: { type: 'integer' },
              estimatedCostUsd: { type: 'number', nullable: true },
              priced: { type: 'boolean' },
            },
          },
        },
      },
    }),
  })
  async usage(ctx: HttpContext) {
    const user = currentUser(ctx)
    return ctx.serialize(await getAiUsageSummary(user.id, ctx.integrationApiKey?.id))
  }

  @ApiOperation({
    summary: '创建 AI 会话',
    description: '创建一个新的纯聊天会话。',
  })
  @ApiBody({ type: () => createConversationValidator, required: true })
  @ApiResponse({
    status: 200,
    description: '已创建的 AI 会话及其消息列表',
    schema: dataEnvelope({
      type: 'object',
      required: ['id', 'title', 'createdAt', 'updatedAt', 'messages'],
      properties: {
        ...conversationSchema.properties,
        messages: { type: 'array', items: messageSchema },
      },
    }),
  })
  @ApiResponse({ status: 422, description: '会话字段无效', schema: errorResponseSchema })
  async store(ctx: HttpContext) {
    const { request, serialize } = ctx
    const user = currentUser(ctx)
    const payload = await request.validateUsing(createConversationValidator)
    const conversation = await AiChatConversation.create({
      userId: user.id,
      apiKeyId: ctx.integrationApiKey?.id ?? null,
      embedSessionId: ctx.embedSessionId ?? null,
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
  @ApiResponse({
    status: 200,
    description: 'AI 会话详情、消息分页和待确认操作',
    schema: dataEnvelope({
      type: 'object',
      required: [
        'id',
        'title',
        'createdAt',
        'updatedAt',
        'messages',
        'messagesMeta',
        'confirmations',
      ],
      properties: {
        ...conversationSchema.properties,
        messages: { type: 'array', items: messageSchema },
        messagesMeta: paginationMetaSchema,
        confirmations: { type: 'array', items: confirmationSchema },
      },
    }),
  })
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
        'pdfName',
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
      properties: {
        content: { type: 'string', maxLength: 8000 },
        image: { type: 'string', format: 'binary' },
        pdf: { type: 'string', format: 'binary', description: '最大 5 MB' },
        pdfMineruConsent: { type: 'boolean', enum: [true] },
        regenerateAssistantMessageId: { type: 'number', minimum: 0, exclusiveMinimum: true },
        contextRoute: { type: 'string', maxLength: 200 },
        contextTitle: { type: 'string', maxLength: 160 },
        context: {
          type: 'object',
          required: ['route', 'title'],
          properties: {
            route: { type: 'string', maxLength: 200 },
            title: { type: 'string', maxLength: 160 },
          },
        },
      },
    },
  })
  @ApiOperation({
    summary: '发送 AI 聊天消息',
    description:
      '保存用户消息，调用 OpenAI 兼容接口，并保存助手回复。支持 JSON 文本请求或包含单张 JPEG、PNG、WebP 图片或用户已授权 MinerU 处理的单份 PDF 的 multipart/form-data 请求。',
  })
  @ApiResponse({
    status: 200,
    description: 'SSE 流包含 Agent 准备阶段、工具状态和不含参数值的调用摘要。',
    mediaType: 'text/event-stream',
    schema: { type: 'string' },
  })
  @ApiResponse({
    status: 409,
    description: '当前会话已有 AI 请求正在运行',
    schema: errorResponseSchema,
  })
  @ApiResponse({
    status: 422,
    description: '消息、附件或 MinerU 授权校验失败',
    schema: errorResponseSchema,
  })
  @ApiResponse({ status: 503, description: '服务端尚未配置 PDF 解析', schema: errorResponseSchema })
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

    const pdfFile = request.file('pdf', { size: '5mb', extnames: ['pdf'] })
    let pdfData: Buffer | undefined
    if (pdfFile) {
      const temporaryPdf = pdfFile.tmpPath
      try {
        if (
          imageFile ||
          payload.regenerateAssistantMessageId ||
          payload.pdfMineruConsent !== true
        ) {
          return response.unprocessableEntity({
            message: '每条消息仅支持一个附件，PDF 需要授权 MinerU 解析',
          })
        }
        if (!(await getMineruToken())) {
          return response.serviceUnavailable({ message: 'PDF 解析服务未配置' })
        }
        if (!pdfFile.isValid || !temporaryPdf) {
          return response.unprocessableEntity({ message: '请上传不超过 5 MB 的有效 PDF' })
        }
        pdfData = await readFile(temporaryPdf)
        if (pdfData.subarray(0, 5).toString('ascii') !== '%PDF-') {
          return response.unprocessableEntity({ message: 'PDF 格式无效' })
        }
      } finally {
        if (temporaryPdf) await rm(temporaryPdf, { force: true })
      }
    }

    if (!content && !imageFile && !pdfData && !payload.regenerateAssistantMessageId) {
      return response.unprocessableEntity({ message: '请输入问题或添加附件' })
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
        (pdfData && pdfFile
          ? await createAiChatPdfMessage(
              conversation.id,
              content,
              basename(pdfFile.clientName).slice(0, 255),
              pdfData
            )
          : await AiChatMessage.create({
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
        conversation.title = createAiChatConversationTitle(content || userMessage.pdfName || '')
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
  @ApiResponse({
    status: 200,
    description: '图片二进制数据',
    mediaType: 'image/*',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiResponse({
    status: 404,
    description: '图片不存在或不属于当前会话',
    schema: errorResponseSchema,
  })
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
  @ApiBody({ type: () => queueAiChatMessageValidator, required: true })
  @ApiResponse({
    status: 200,
    description: 'Agent 已接受排队指令',
    schema: dataEnvelope({
      type: 'object',
      required: ['queued', 'mode', 'agentRunId', 'message'],
      properties: {
        queued: { type: 'boolean', enum: [true] },
        mode: { type: 'string', enum: ['steer', 'followUp'] },
        agentRunId: { type: 'string' },
        message: messageSchema,
      },
    }),
  })
  @ApiResponse({
    status: 409,
    description: '当前会话没有可接收指令的运行',
    schema: errorResponseSchema,
  })
  async steer(ctx: HttpContext) {
    return this.queueAgentMessage(ctx, 'steer')
  }

  @ApiOperation({
    summary: '向 AI Agent 排队后续指令',
    description: '使用 Pi 原生 follow-up 队列，在当前运行结束后处理人工指令。',
  })
  @ApiBody({ type: () => queueAiChatMessageValidator, required: true })
  @ApiResponse({
    status: 200,
    description: 'Agent 已接受排队指令',
    schema: dataEnvelope({
      type: 'object',
      required: ['queued', 'mode', 'agentRunId', 'message'],
      properties: {
        queued: { type: 'boolean', enum: [true] },
        mode: { type: 'string', enum: ['steer', 'followUp'] },
        agentRunId: { type: 'string' },
        message: messageSchema,
      },
    }),
  })
  @ApiResponse({
    status: 409,
    description: '当前会话没有可接收指令的运行',
    schema: errorResponseSchema,
  })
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
  @ApiResponse({
    status: 200,
    description: '已执行受控操作并返回操作状态及助手消息',
    schema: dataEnvelope({
      type: 'object',
      required: [
        'id',
        'action',
        'status',
        'impact',
        'targetType',
        'targetSummary',
        'changeSummary',
        'presentation',
        'message',
      ],
      properties: { ...confirmationSchema.properties, message: messageSchema },
    }),
  })
  @ApiResponse({ status: 403, description: '当前用户无权执行该操作', schema: errorResponseSchema })
  @ApiResponse({ status: 404, description: '待确认操作不存在', schema: errorResponseSchema })
  @ApiResponse({
    status: 409,
    description: '会话已有运行或操作状态已改变',
    schema: errorResponseSchema,
  })
  @ApiResponse({ status: 422, description: '待确认操作无效', schema: errorResponseSchema })
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
  @ApiResponse({
    status: 200,
    description: '受控操作已取消',
    schema: dataEnvelope(confirmationSchema),
  })
  @ApiResponse({ status: 403, description: '当前用户无权取消该操作', schema: errorResponseSchema })
  @ApiResponse({ status: 404, description: '待确认操作不存在', schema: errorResponseSchema })
  @ApiResponse({
    status: 409,
    description: '会话已有运行或操作状态已改变',
    schema: errorResponseSchema,
  })
  @ApiResponse({ status: 422, description: '待确认操作无效', schema: errorResponseSchema })
  async cancelAiAgentAction(ctx: HttpContext) {
    return this.handleAiAgentActionCancellation(ctx)
  }

  @ApiOperation({
    summary: '流式取消 AI 代理受控操作',
    description: '取消当前用户创建且尚未执行的受控操作，并通过 SSE 返回助手结果。',
  })
  @ApiResponse({
    status: 200,
    description: 'SSE 流返回取消状态和助手回复',
    mediaType: 'text/event-stream',
    schema: { type: 'string' },
  })
  async cancelAiAgentActionStream(ctx: HttpContext) {
    return this.handleAiAgentActionCancellation(ctx, true)
  }

  private async handleAiAgentActionCancellation(ctx: HttpContext, streaming = false) {
    const { params, request, response, serialize } = ctx
    const route = await request.validateUsing(aiChatConfirmationRouteValidator, { data: params })
    const user = currentUser(ctx)
    const conversation = await conversationsFor(ctx, user.id).where('id', route.id).firstOrFail()
    if (!claimAiAgentConversation(conversation.id, user.id)) {
      return response.conflict({ message: '当前会话已有 AI 请求正在运行，请稍后再试' })
    }

    let stopKeepalive: (() => void) | undefined
    if (streaming) {
      response.header('Content-Type', 'text/event-stream; charset=utf-8')
      response.header('Cache-Control', 'no-cache, no-transform')
      response.header('Connection', 'keep-alive')
      response.header('X-Accel-Buffering', 'no')
      response.writeHead(200)
      stopKeepalive = startAiChatSseKeepalive(response)
    }

    try {
      const result = await cancelAiChatConfirmationAndUpdateMessage({
        ctx,
        conversation,
        confirmationId: Number(route.confirmationId),
        userId: user.id,
        source: 'api',
        response: streaming ? response : undefined,
      })
      if (!streaming) return serialize(result.confirmation)
      if (!result.message) {
        writeAiChatSse(response, 'error', { message: '找不到对应的助手消息' })
        return
      }
      if (result.summaryStreamed) return
      if (result.replyDelta) writeAiChatSse(response, 'delta', { content: result.replyDelta })
      writeAiChatSse(response, 'done', {
        conversation: serializeAiChatConversation(conversation),
        message: serializeAiChatMessage(result.message),
        confirmations: result.pendingConfirmations,
      })
    } catch (error) {
      if (streaming) {
        const message =
          error instanceof AiAgentConfirmationError ? error.message : '取消操作未完成，请稍后重试。'
        if (!(error instanceof AiAgentConfirmationError)) {
          logger.error(
            { err: error, confirmationId: route.confirmationId, conversationId: conversation.id },
            'AI confirmation cancellation stream failed'
          )
        }
        writeAiChatSse(response, 'error', { message })
        return
      }
      if (error instanceof AiAgentConfirmationError) {
        if (error.status === 404) return response.notFound({ message: error.message })
        if (error.status === 409) return response.conflict({ message: error.message })
        if (error.status === 403) return response.forbidden({ message: error.message })
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    } finally {
      stopKeepalive?.()
      if (streaming && !response.response.writableEnded) response.response.end()
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
    mediaType: 'text/event-stream',
    schema: { type: 'string' },
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
  @ApiResponse({
    status: 200,
    description: '会话已删除',
    schema: dataEnvelope({
      type: 'object',
      required: ['id', 'deleted'],
      properties: { id: { type: 'integer' }, deleted: { type: 'boolean', enum: [true] } },
    }),
  })
  async destroy(ctx: HttpContext) {
    const { params, serialize } = ctx
    const user = currentUser(ctx)
    const conversation = await conversationsFor(ctx, user.id).where('id', params.id).firstOrFail()

    await resetAiConversationState({ conversationId: conversation.id, userId: user.id })
    await conversation.delete()
    return serialize({ id: Number(params.id), deleted: true })
  }
}
