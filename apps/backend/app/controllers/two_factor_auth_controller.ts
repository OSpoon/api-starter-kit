import crypto from 'node:crypto'

import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'
import { generateSecret, generateURI, verify } from 'otplib'
import QRCode from 'qrcode'

import User from '#models/user'
import {
  decryptRecoveryCodes,
  decryptTwoFactorSecret,
  encryptRecoveryCodes,
  encryptTwoFactorSecret,
} from '#security/two_factor_secret_store'
import { parseTwoFactorTempToken } from '#security/two_factor_token'
import { recordAuditEvent } from '#services/audit_log'
import { loadUserAccess } from '#services/user_access'
import UserTransformer from '#transformers/user_transformer'
import { enableTwoFactorValidator, verifyTwoFactorValidator } from '#validators/user'

export default class TwoFactorAuthController {
  @ApiSecurity('bearerAuth')
  @ApiOperation({
    summary: '生成 2FA 配置',
    description: '为当前管理员生成 2FA secret 和二维码。secret 仅用于启用前确认。',
  })
  @ApiResponse({ status: 200, description: '2FA secret 和二维码' })
  async generate({ auth, serialize }: HttpContext) {
    const user = auth.getUserOrFail()
    const secret = generateSecret()
    const otpauth = generateURI({
      secret,
      label: user.email,
      issuer: 'API Starter Kit',
    })
    const qrCode = await QRCode.toDataURL(otpauth)

    return serialize({ secret, qrCode })
  }

  @ApiSecurity('bearerAuth')
  @ApiOperation({
    summary: '启用 2FA',
    description: '校验一次性验证码后启用 2FA，并返回恢复码。secret 和恢复码会加密保存。',
  })
  @ApiResponse({ status: 200, description: '已更新的管理员资料和恢复码' })
  @ApiResponse({ status: 400, description: '验证码无效' })
  async enable(ctx: HttpContext) {
    const { auth, request, response, serialize } = ctx
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(enableTwoFactorValidator)
    const { valid } = await verify({ token: payload.token, secret: payload.secret })

    if (!valid) {
      await recordAuditEvent(ctx, {
        actorUserId: user.id,
        action: 'account.two_factor_enable_rejected',
        targetType: 'user',
        targetId: user.id,
        outcome: 'denied',
        reasonCode: 'invalid_code',
      })
      return response.badRequest({ message: '验证码无效' })
    }

    const recoveryCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(6).toString('base64url').toUpperCase()
    )

    user.twoFactorSecret = encryptTwoFactorSecret(payload.secret)
    user.twoFactorEnabled = true
    user.twoFactorRecoveryCodes = encryptRecoveryCodes(recoveryCodes)
    await user.save()
    await recordAuditEvent(ctx, {
      actorUserId: user.id,
      action: 'account.two_factor_enabled',
      targetType: 'user',
      targetId: user.id,
    })

    return serialize({
      user: UserTransformer.transform(await loadUserAccess(user)),
      recoveryCodes,
    })
  }

  @ApiOperation({
    summary: '登录阶段校验 2FA',
    description: '使用登录接口返回的临时 token、一次性验证码或恢复码完成 2FA 验证。',
  })
  @ApiResponse({ status: 200, description: '管理员资料和访问 token' })
  @ApiResponse({ status: 401, description: '临时会话过期或验证码无效' })
  async verify(ctx: HttpContext) {
    const { request, response, serialize } = ctx
    const payload = await request.validateUsing(verifyTwoFactorValidator)
    const pending = parseTwoFactorTempToken(payload.tempToken)

    if (!pending) {
      await recordAuditEvent(ctx, {
        actorUserId: null,
        actorType: 'anonymous',
        action: 'auth.two_factor_rejected',
        targetType: 'authentication',
        outcome: 'denied',
        reasonCode: 'invalid_temp_token',
      })
      return response.unauthorized({ message: '会话已过期，请重新登录' })
    }

    const user = await db.transaction(async (trx) => {
      const candidate = await User.query({ client: trx })
        .where('id', pending.userId)
        .forUpdate()
        .first()
      if (!candidate || candidate.disabledAt || !candidate.twoFactorEnabled) return null
      if (!candidate.twoFactorSecret) throw new Error('Enabled 2FA secret is missing')
      const secret = decryptTwoFactorSecret(candidate.twoFactorSecret)
      if (!secret) throw new Error('Enabled 2FA secret is missing')

      let valid = false
      try {
        const result = await verify({ token: payload.code, secret })
        valid = result.valid
      } catch {
        // Recovery codes are not TOTP values.
      }

      if (!valid) {
        if (!candidate.twoFactorRecoveryCodes) {
          throw new Error('Enabled 2FA recovery codes are missing')
        }
        const recoveryCodes = decryptRecoveryCodes(candidate.twoFactorRecoveryCodes)
        if (recoveryCodes.includes(payload.code)) {
          candidate.twoFactorRecoveryCodes = encryptRecoveryCodes(
            recoveryCodes.filter((code) => code !== payload.code)
          )
          await candidate.save()
          valid = true
        }
      }

      return valid ? candidate : null
    })

    if (!user) {
      await recordAuditEvent(ctx, {
        actorUserId: null,
        actorType: 'anonymous',
        action: 'auth.two_factor_rejected',
        targetType: 'user',
        targetId: pending.userId,
        outcome: 'denied',
        reasonCode: 'invalid_code',
      })
      return response.unauthorized({ message: '验证码无效' })
    }

    const token = await User.accessTokens.create(user)
    await recordAuditEvent(ctx, {
      actorUserId: user.id,
      action: 'auth.login_succeeded',
      targetType: 'user',
      targetId: user.id,
      metadata: { authenticationFactor: 'two_factor' },
    })

    return serialize({
      user: UserTransformer.transform(await loadUserAccess(user)),
      token: token.value!.release(),
    })
  }
}
