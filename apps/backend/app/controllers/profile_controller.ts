import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'
import { DateTime } from 'luxon'

import ChannelIdentity from '#models/channel_identity'
import GithubIdentity from '#models/github_identity'
import User from '#models/user'
import { isStrongPassword, passwordContext } from '#security/password_strength'
import { recordAuditEvent } from '#services/audit_log'
import { loadUserAccess } from '#services/user_access'
import UserTransformer from '#transformers/user_transformer'
import { changePasswordValidator, twoFactorValidator } from '#validators/user'

@ApiSecurity('bearerAuth')
export default class ProfileController {
  @ApiOperation({
    summary: '获取管理员资料',
    description: '获取当前登录管理员的资料和安全状态。',
  })
  @ApiResponse({ status: 200, description: '管理员资料' })
  async show({ auth, serialize }: HttpContext) {
    return serialize(await this.profilePayload(auth.getUserOrFail()))
  }

  @ApiOperation({
    summary: '修改登录密码',
    description: '验证当前密码后修改管理员登录密码，并重新计算密码更新时间。',
  })
  @ApiResponse({ status: 200, description: '已更新的管理员资料' })
  @ApiResponse({ status: 400, description: '当前密码错误或新旧密码相同' })
  @ApiResponse({ status: 422, description: '密码强度不足' })
  async changePassword(ctx: HttpContext) {
    const { auth, request, response, serialize } = ctx
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(changePasswordValidator)

    const verifiedUser = await User.verifyCredentials(user.email, payload.currentPassword).catch(
      () => null
    )
    if (!verifiedUser) {
      return response.badRequest({ message: '当前密码不正确' })
    }

    if (payload.currentPassword === payload.password) {
      return response.badRequest({ message: '新密码不能与当前密码相同' })
    }

    if (
      !isStrongPassword(payload.password, passwordContext([user.email, user.fullName, 'admin']))
    ) {
      return response.unprocessableEntity({
        message: '密码强度不足，请避免使用常见、易猜测或包含账号信息的密码',
      })
    }

    // User's auth finder hashes dirty passwords before persistence. Keep every
    // credential write path (creation, reset, and self-service change) on the
    // same raw-password contract to avoid hashing an already-hashed value.
    user.password = payload.password
    user.passwordChangedAt = DateTime.now()
    await user.save()
    await recordAuditEvent(ctx, {
      actorUserId: user.id,
      action: 'account.password_changed',
      targetType: 'user',
      targetId: user.id,
    })

    return serialize(await this.profilePayload(user))
  }

  @ApiOperation({
    summary: '停用双重身份验证',
    description: '验证登录密码后停用 2FA，并清空 2FA secret 和恢复码。',
  })
  @ApiResponse({ status: 200, description: '已更新的管理员资料' })
  @ApiResponse({ status: 400, description: '密码错误' })
  async disableTwoFactor(ctx: HttpContext) {
    const { auth, request, response, serialize } = ctx
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(twoFactorValidator)
    const verifiedUser = await User.verifyCredentials(user.email, payload.password).catch(
      () => null
    )

    if (!verifiedUser) {
      return response.badRequest({ message: '密码不正确' })
    }

    user.twoFactorEnabled = false
    user.twoFactorSecret = null
    user.twoFactorRecoveryCodes = null
    await user.save()
    await recordAuditEvent(ctx, {
      actorUserId: user.id,
      action: 'account.two_factor_disabled',
      targetType: 'user',
      targetId: user.id,
    })

    return serialize(await this.profilePayload(user))
  }

  @ApiOperation({
    summary: '解绑 GitHub 账号',
    description: '验证当前登录密码后解除当前管理员与 GitHub 账号的绑定。',
  })
  @ApiResponse({ status: 200, description: '已解绑 GitHub 的管理员资料' })
  @ApiResponse({ status: 400, description: '当前密码错误或未绑定 GitHub' })
  async unlinkGithub(ctx: HttpContext) {
    const { auth, request, response, serialize } = ctx
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(twoFactorValidator)
    const verifiedUser = await User.verifyCredentials(user.email, payload.password).catch(
      () => null
    )

    if (!verifiedUser) {
      return response.badRequest({ message: '密码不正确' })
    }

    const identity = await GithubIdentity.findBy('userId', user.id)
    if (!identity) {
      return response.badRequest({ message: '当前账号未绑定 GitHub' })
    }

    await identity.delete()
    await recordAuditEvent(ctx, {
      actorUserId: user.id,
      action: 'account.github_unlinked',
      targetType: 'user',
      targetId: user.id,
    })

    return serialize(await this.profilePayload(user))
  }

  private async profilePayload(user: User) {
    const [profile, githubIdentity, channelIdentities] = await Promise.all([
      loadUserAccess(user),
      GithubIdentity.findBy('userId', user.id),
      ChannelIdentity.query()
        .where('userId', user.id)
        .where('status', 'active')
        .select(['channel', 'boundAt']),
    ])
    profile.githubLinked = Boolean(githubIdentity)
    Object.assign(profile, {
      channelIdentities: channelIdentities.map((identity) => ({
        channel: identity.channel,
        boundAt: identity.boundAt.toISO(),
      })),
    })
    return UserTransformer.transform(profile)
  }
}
