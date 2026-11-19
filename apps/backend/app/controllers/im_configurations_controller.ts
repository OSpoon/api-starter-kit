import type { HttpContext } from '@adonisjs/core/http'
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@foadonis/openapi/decorators'

import type { ChannelName } from '#models/channel_identity'
import ImBot from '#models/im_bot'
import { recordAuditEvent } from '#services/audit_log'
import { createImBot, listImBots, updateImBot } from '#services/im_configuration_service'
import { clampLimit } from '#support/pagination'
import {
  createImBotValidator,
  imBotIdValidator,
  listImBotsValidator,
  updateImBotValidator,
} from '#validators/im_configuration'

@ApiSecurity('bearerAuth')
export default class ImConfigurationsController {
  @ApiOperation({ summary: '分页获取 IM 机器人配置' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiQuery({ name: 'search', required: false, schema: { type: 'string', maxLength: 200 } })
  @ApiQuery({
    name: 'channels',
    required: false,
    schema: {
      type: 'string',
      pattern: '^(wecom|feishu|dingtalk)(,(wecom|feishu|dingtalk))*$',
      description: '以逗号分隔的平台标识',
    },
  })
  @ApiResponse({ status: 200, description: '机器人分页列表，密钥仅返回配置状态' })
  async index({ request, serialize }: HttpContext) {
    const filters = await request.validateUsing(listImBotsValidator, { data: request.qs() })
    return serialize(
      await listImBots({
        page: Number(filters.page ?? 1),
        limit: clampLimit(filters.limit, 20, 100),
        search: filters.search,
        channels: filters.channels?.split(',') as ChannelName[] | undefined,
      })
    )
  }

  @ApiOperation({ summary: '新增 IM 机器人' })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['name', 'channel', 'identifier', 'secret'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 160 },
        channel: { type: 'string', enum: ['wecom', 'feishu', 'dingtalk'] },
        identifier: { type: 'string', minLength: 1, maxLength: 160 },
        secret: { type: 'string', writeOnly: true, minLength: 1, maxLength: 500 },
        tenantId: { type: 'string', nullable: true, maxLength: 160 },
        endpoint: { type: 'string', nullable: true, maxLength: 500 },
        cardTemplateId: { type: 'string', nullable: true, maxLength: 200 },
        streamingCardTemplateId: { type: 'string', nullable: true, maxLength: 200 },
        enabled: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 201, description: '机器人已创建，密钥仅返回配置状态' })
  @ApiResponse({ status: 409, description: '同平台应用标识已存在' })
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createImBotValidator)
    if (payload.channel === 'wecom' && !payload.tenantId) {
      return ctx.response.unprocessableEntity({ message: '企业微信机器人必须填写企业标识' })
    }
    try {
      const bot = await createImBot(payload)
      await recordAuditEvent(ctx, {
        actorUserId: ctx.auth.getUserOrFail().id,
        action: 'im_bot.created',
        targetType: 'im_bot',
        targetId: bot.id,
        metadata: { channel: bot.channel, name: bot.name, enabled: bot.enabled },
      })
      return ctx.response.created(ctx.serialize(bot))
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return ctx.response.conflict({ message: '该平台的应用标识已存在' })
      }
      throw error
    }
  }

  @ApiOperation({ summary: '更新 IM 机器人' })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 160 },
        identifier: { type: 'string', nullable: true, maxLength: 160 },
        secret: { type: 'string', writeOnly: true, nullable: true, maxLength: 500 },
        tenantId: { type: 'string', nullable: true, maxLength: 160 },
        endpoint: { type: 'string', nullable: true, maxLength: 500 },
        cardTemplateId: { type: 'string', nullable: true, maxLength: 200 },
        streamingCardTemplateId: { type: 'string', nullable: true, maxLength: 200 },
        enabled: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '机器人已更新，密钥仅返回配置状态' })
  @ApiResponse({ status: 409, description: '同平台应用标识已存在' })
  async update(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    const { id } = await request.validateUsing(imBotIdValidator, { data: params })
    const payload = await request.validateUsing(updateImBotValidator)
    const bot = await ImBot.findOrFail(Number(id))
    const identifier = payload.identifier?.trim() || bot.identifier
    const secret = payload.secret?.trim() ? payload.secret : bot.secret
    const tenantId = payload.tenantId?.trim() || bot.tenantId
    const enabled = payload.enabled ?? bot.enabled
    if (enabled && (!identifier || !secret || (bot.channel === 'wecom' && !tenantId))) {
      return response.unprocessableEntity({ message: '启用机器人需要完整的应用凭据' })
    }
    try {
      const updated = await updateImBot(bot, payload)
      await recordAuditEvent(ctx, {
        actorUserId: auth.getUserOrFail().id,
        action: payload.enabled === undefined ? 'im_bot.updated' : 'im_bot.status_updated',
        targetType: 'im_bot',
        targetId: bot.id,
        metadata: { channel: bot.channel, name: updated.name, enabled: updated.enabled },
      })
      return ctx.serialize(updated)
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return response.conflict({ message: '该平台的应用标识已存在' })
      }
      throw error
    }
  }
}
