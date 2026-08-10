import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import WecomMessageTemplate from '#models/wecom_message_template'
import { recordAuditEvent } from '#services/audit_log'
import { clampLimit } from '#services/pagination'
import {
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
import {
  createWecomMessageTemplateValidator,
  updateWecomMessageTemplateValidator,
  wecomTemplateParamsValidator,
} from '#validators/wecom_message_template'

@ApiSecurity('bearerAuth')
export default class WecomMessageTemplatesController {
  @ApiOperation({ summary: '获取企业微信消息模板列表' })
  @ApiResponse({ status: 200, description: '模板列表' })
  async index({ request, serialize }: HttpContext) {
    const page = Math.max(Number(request.input('page', 1)) || 1, 1)
    const paginator = await WecomMessageTemplate.query()
      .whereIn('msgtype', ['text', 'markdown', 'markdown_v2'])
      .orderBy('updated_at', 'desc')
      .paginate(page, clampLimit(request.input('limit'), 20, 100))
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
    try {
      const result = await sendWecomMessageTemplate(template, runtimeParams, mentions)
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
}
