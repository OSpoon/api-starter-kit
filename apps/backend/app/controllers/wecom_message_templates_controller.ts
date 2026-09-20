import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import WecomMessageTemplate from '#models/wecom_message_template'
import { recordAuditEvent } from '#services/audit_log'
import {
  auditWecomMessageSend,
  decryptWebhookUrl,
  encryptWebhookUrl,
  getWecomTestWebhookUrl,
  inferTemplateParameters,
  sendWecomMessageTemplate,
  serializeWecomMessageTemplate,
  validateTemplateDefinition,
  validateTemplateStoragePayload,
  validateWebhookUrl,
  validateWecomTemplatePayload,
} from '#services/wecom_message_template_service'
import { clampLimit } from '#support/pagination'
import { paginationSearchQueryValidator } from '#validators/pagination'
import {
  createWecomMessageTemplateValidator,
  updateWecomMessageTemplateValidator,
  wecomTemplateParamsValidator,
} from '#validators/wecom_message_template'

@ApiSecurity('bearerAuth')
export default class WecomMessageTemplatesController {
  @ApiOperation({
    summary: '获取企业微信消息模板列表',
    description: '返回企业微信消息模板分页列表，支持按名称、描述或消息类型搜索。',
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
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: '搜索模板名称、描述或消息类型；去除首尾空格，空值不过滤，最多 200 个字符',
    schema: { type: 'string', maxLength: 200 },
  })
  @ApiResponse({ status: 200, description: '企业微信消息模板分页列表' })
  async index({ request, serialize }: HttpContext) {
    const payload = await paginationSearchQueryValidator.validate(request.qs())
    const search = payload.search ?? ''
    const query = WecomMessageTemplate.query()
      .whereIn('msgtype', ['text', 'markdown', 'markdown_v2'])
      .orderBy('updated_at', 'desc')
    if (search) {
      query.where((builder) => {
        builder
          .whereILike('name', `%${search}%`)
          .orWhereILike('description', `%${search}%`)
          .orWhereILike('msgtype', `%${search}%`)
      })
    }
    const paginator = await query.paginate(payload.page ?? 1, clampLimit(payload.limit, 20, 100))
    return serialize({
      items: paginator.all().map(serializeWecomMessageTemplate),
      meta: paginator.getMeta(),
    })
  }

  async store(ctx: HttpContext) {
    const { auth, request, response, serialize } = ctx
    const payload = await request.validateUsing(createWecomMessageTemplateValidator)
    const parameters = inferTemplateParameters(payload.payload)
    try {
      validateWecomTemplatePayload(payload.msgtype, payload.payload)
      validateTemplateStoragePayload(payload.payload)
      validateTemplateDefinition(payload.payload, parameters)
      validateWebhookUrl(payload.webhookUrl)
    } catch (error) {
      if (error instanceof Error && error.name === 'WecomTemplateValidationError') {
        return response.unprocessableEntity({
          code: 'E_WECOM_TEMPLATE_VALIDATION',
          message: error.message,
        })
      }
      throw error
    }
    const template = await WecomMessageTemplate.create({
      name: payload.name,
      msgtype: payload.msgtype,
      payload: payload.payload,
      parameters,
      webhookUrl: encryptWebhookUrl(payload.webhookUrl),
      description: payload.description ?? null,
      enabled: payload.enabled ?? true,
    })
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'wecom_template.created',
      targetType: 'wecom_message_template',
      targetId: template.id,
      metadata: { name: template.name, msgtype: template.msgtype },
    })
    return serialize(serializeWecomMessageTemplate(template))
  }

  async update(ctx: HttpContext) {
    const { auth, params, request, response, serialize } = ctx
    const template = await WecomMessageTemplate.findOrFail(params.id)
    const payload = await request.validateUsing(updateWecomMessageTemplateValidator)
    const parameters = inferTemplateParameters(payload.payload)
    try {
      validateWecomTemplatePayload(payload.msgtype, payload.payload)
      validateTemplateStoragePayload(payload.payload)
      validateTemplateDefinition(payload.payload, parameters)
      if (payload.webhookUrl) validateWebhookUrl(payload.webhookUrl)
    } catch (error) {
      if (error instanceof Error && error.name === 'WecomTemplateValidationError') {
        return response.unprocessableEntity({
          code: 'E_WECOM_TEMPLATE_VALIDATION',
          message: error.message,
        })
      }
      throw error
    }
    template.merge({
      name: payload.name,
      msgtype: payload.msgtype,
      payload: payload.payload,
      parameters,
      webhookUrl: payload.webhookUrl ? encryptWebhookUrl(payload.webhookUrl) : template.webhookUrl,
      description: payload.description ?? null,
      enabled: payload.enabled ?? template.enabled,
    })
    await template.save()
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'wecom_template.updated',
      targetType: 'wecom_message_template',
      targetId: template.id,
      metadata: { name: template.name, msgtype: template.msgtype },
    })
    return serialize(serializeWecomMessageTemplate(template))
  }

  async destroy(ctx: HttpContext) {
    const { auth, params, serialize } = ctx
    const template = await WecomMessageTemplate.findOrFail(params.id)
    await template.delete()
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'wecom_template.deleted',
      targetType: 'wecom_message_template',
      targetId: template.id,
      metadata: { name: template.name },
    })
    return serialize({ id: template.id, deleted: true })
  }

  // Kept as an explicit service boundary for future business features; the management API never returns the URL.
  static decryptWebhook(template: WecomMessageTemplate) {
    return decryptWebhookUrl(template.webhookUrl)
  }

  @ApiOperation({ summary: '测试发送企业微信消息模板' })
  @ApiResponse({ status: 200, description: '测试发送结果' })
  @ApiResponse({ status: 422, description: '模板或参数校验失败' })
  @ApiResponse({ status: 429, description: '超过企业微信发送频率限制' })
  async testSend(ctx: HttpContext) {
    const { params, request, response, serialize } = ctx
    const template = await WecomMessageTemplate.findOrFail(params.id)
    await request.validateUsing(wecomTemplateParamsValidator)
    const runtimeParams = request.input('params', {}) as Record<string, string>
    const mentions = {
      mentionedList: request.input('mentioned_list') as string[] | undefined,
      mentionedMobileList: request.input('mentioned_mobile_list') as string[] | undefined,
    }
    try {
      const result = await sendWecomMessageTemplate(template, runtimeParams, {
        webhookUrl: getWecomTestWebhookUrl(),
        ...mentions,
      })
      return serialize({ sent: true, result })
    } catch (error) {
      if (error instanceof Error && error.name === 'WecomTemplateRateLimitError') {
        const retryAfter = (error as { retryAfter?: number }).retryAfter ?? 60
        response.header('Retry-After', String(retryAfter))
        return response.tooManyRequests({
          code: 'E_WECOM_TEMPLATE_RATE_LIMIT',
          message: error.message,
          retryAfter,
        })
      }
      if (error instanceof Error && error.name === 'WecomTemplateValidationError') {
        return response.unprocessableEntity({
          code: 'E_WECOM_TEMPLATE_VALIDATION',
          message: error.message,
        })
      }
      return response.badGateway({
        code: 'E_WECOM_PROVIDER_ERROR',
        message: '企业微信消息发送失败',
      })
    }
  }

  @ApiOperation({ summary: '发送企业微信消息模板' })
  @ApiResponse({ status: 200, description: '消息发送结果' })
  @ApiResponse({ status: 422, description: '模板或参数校验失败' })
  @ApiResponse({ status: 429, description: '超过企业微信发送频率限制' })
  async send(ctx: HttpContext) {
    const { params, request, response, serialize } = ctx
    const template = await WecomMessageTemplate.findOrFail(params.id)
    await request.validateUsing(wecomTemplateParamsValidator)
    const runtimeParams = request.input('params', {}) as Record<string, string>
    const mentions = {
      mentionedList: request.input('mentioned_list') as string[] | undefined,
      mentionedMobileList: request.input('mentioned_mobile_list') as string[] | undefined,
    }
    let result: unknown
    try {
      result = await sendWecomMessageTemplate(template, runtimeParams, mentions)
    } catch (error) {
      if (error instanceof Error && error.name === 'WecomTemplateRateLimitError') {
        const retryAfter = (error as { retryAfter?: number }).retryAfter ?? 60
        response.header('Retry-After', String(retryAfter))
        return response.tooManyRequests({
          code: 'E_WECOM_TEMPLATE_RATE_LIMIT',
          message: error.message,
          retryAfter,
        })
      }
      if (error instanceof Error && error.name === 'WecomTemplateValidationError') {
        return response.unprocessableEntity({
          code: 'E_WECOM_TEMPLATE_VALIDATION',
          message: error.message,
        })
      }
      return response.badGateway({
        code: 'E_WECOM_PROVIDER_ERROR',
        message: '企业微信消息发送失败',
      })
    }
    const integrationApiKey = ctx.integrationApiKey
    await auditWecomMessageSend(ctx, {
      actorUserId: integrationApiKey ? null : ctx.auth.getUserOrFail().id,
      ...(integrationApiKey ? { apiKeyId: integrationApiKey.id } : {}),
      source: integrationApiKey ? 'api_key' : 'session',
      template,
      params: runtimeParams,
      ...mentions,
    })
    return serialize({ sent: true, result })
  }
}
