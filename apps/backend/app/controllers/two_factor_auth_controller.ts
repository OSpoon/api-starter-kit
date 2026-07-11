import crypto from 'node:crypto'

import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'
import { generateSecret, generateURI, verify } from 'otplib'
import QRCode from 'qrcode'

import User from '#models/user'
import { recordAuditEvent } from '#services/audit_log'
import {
  decryptRecoveryCodes,
  decryptTwoFactorSecret,
  encryptRecoveryCodes,
  encryptTwoFactorSecret,
} from '#services/two_factor_secret_store'
import { parseTwoFactorTempToken } from '#services/two_factor_token'
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
  async verify({ request, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(verifyTwoFactorValidator)
    const pending = parseTwoFactorTempToken(payload.tempToken)

    if (!pending) {
      return response.unauthorized({ message: '会话已过期，请重新登录' })
    }

    const user = await User.find(pending.userId)
    const secret = decryptTwoFactorSecret(user?.twoFactorSecret)
    if (!user || !user.twoFactorEnabled || !secret) {
      return response.unauthorized({ message: '用户不存在或未启用 2FA' })
    }

    const { valid } = await verify({ token: payload.code, secret })
    let isRecovery = false

    if (!valid && user.twoFactorRecoveryCodes) {
      const recoveryCodes = decryptRecoveryCodes(user.twoFactorRecoveryCodes)
      if (recoveryCodes.includes(payload.code)) {
        isRecovery = true
        user.twoFactorRecoveryCodes = encryptRecoveryCodes(
          recoveryCodes.filter((code) => code !== payload.code)
        )
        await user.save()
      }
    }

    if (!valid && !isRecovery) {
      return response.unauthorized({ message: '验证码无效' })
    }

    const token = await User.accessTokens.create(user)

    return serialize({
      user: UserTransformer.transform(await loadUserAccess(user)),
      token: token.value!.release(),
    })
  }
}
