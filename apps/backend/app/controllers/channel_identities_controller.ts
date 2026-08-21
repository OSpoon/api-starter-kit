import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import ChannelIdentity from '#models/channel_identity'
import User from '#models/user'
import { recordAuditEvent } from '#services/audit_log'
import {
  ChannelBindingError,
  consumeChannelBindingChallenge,
} from '#services/channel_binding_service'
import { revokeChannelIdentity } from '#services/channel_identity_service'
import { bindChannelIdentityValidator } from '#validators/channel_identity'
import { twoFactorValidator } from '#validators/user'

export default class ChannelIdentitiesController {
  @ApiSecurity('bearerAuth')
  @ApiOperation({ summary: '绑定外部 AI 渠道身份' })
  @ApiResponse({ status: 200, description: '渠道身份绑定成功' })
  @ApiResponse({ status: 404, description: '绑定码无效或已过期' })
  @ApiResponse({ status: 409, description: '渠道身份已被其他用户绑定' })
  async bind(ctx: HttpContext) {
    const { auth, request, response, serialize } = ctx
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(bindChannelIdentityValidator)

    try {
      const identity = await consumeChannelBindingChallenge({
        code: payload.code,
        userId: user.id,
      })
      await recordAuditEvent(ctx, {
        actorUserId: user.id,
        action: 'account.channel_identity_bound',
        targetType: 'channel_identity',
        targetId: identity.id,
        metadata: {
          channel: identity.channel,
          externalTenantId: identity.externalTenantId,
          externalUserId: identity.externalUserId,
        },
      })
      return serialize({
        bound: true,
        channel: identity.channel,
        externalTenantId: identity.externalTenantId,
        externalUserId: identity.externalUserId,
      })
    } catch (error) {
      if (error instanceof ChannelBindingError) {
        if (error.status === 404) return response.notFound({ message: error.message })
        if (error.status === 409) return response.conflict({ message: error.message })
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
  }

  @ApiSecurity('bearerAuth')
  @ApiOperation({ summary: '解绑企业微信智能机器人身份' })
  @ApiResponse({ status: 200, description: '企业微信身份解绑成功' })
  @ApiResponse({ status: 400, description: '密码错误或当前未绑定企业微信' })
  async unbindWecom(ctx: HttpContext) {
    const { auth, request, response, serialize } = ctx
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(twoFactorValidator)
    const verifiedUser = await User.verifyCredentials(user.email, payload.password).catch(
      () => null
    )

    if (!verifiedUser) {
      return response.badRequest({ message: '密码不正确' })
    }

    const identity = await ChannelIdentity.query()
      .where('channel', 'wecom')
      .where('userId', user.id)
      .where('status', 'active')
      .first()

    if (!identity) {
      return response.badRequest({ message: '当前账号未绑定企业微信智能机器人' })
    }

    await revokeChannelIdentity(identity)
    await recordAuditEvent(ctx, {
      actorUserId: user.id,
      action: 'account.channel_identity_unbound',
      targetType: 'channel_identity',
      targetId: identity.id,
      metadata: {
        channel: identity.channel,
        externalTenantId: identity.externalTenantId,
        externalUserId: identity.externalUserId,
      },
    })

    return serialize({ unbound: true, channel: 'wecom' })
  }
}
