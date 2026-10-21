import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'
import { DateTime } from 'luxon'

import { isTurnstileEnabled, verifyTurnstileToken } from '#integrations/turnstile'
import User from '#models/user'
import { createTwoFactorTempToken } from '#security/two_factor_token'
import { loadUserAccess } from '#services/user_access'
import UserTransformer from '#transformers/user_transformer'
import { loginValidator } from '#validators/user'

const INVALID_CREDENTIALS = { code: 'E_INVALID_CREDENTIALS', status: 401 }

export default class AccessTokensController {
  @ApiOperation({
    summary: '管理员登录',
    description:
      '使用管理员邮箱和密码登录。若已启用 2FA，会返回临时 token 并要求继续完成 2FA 验证。',
  })
  @ApiResponse({ status: 200, description: '登录结果、访问 token 或 2FA 临时 token' })
  @ApiResponse({ status: 401, description: '账号或密码错误' })
  async store({ request, serialize }: HttpContext) {
    const { email, password, turnstileToken } = await request.validateUsing(loginValidator)

    if (isTurnstileEnabled() && !(await verifyTurnstileToken(turnstileToken ?? '', request.ip()))) {
      throw { code: 'E_TURNSTILE_FAILED', status: 403 }
    }

    const userRecord = await User.findBy('email', email)

    if (userRecord?.disabledAt) {
      throw INVALID_CREDENTIALS
    }

    const user = await User.verifyCredentials(email, password).catch(async () => {
      if (userRecord) {
        await db.from('users').where('id', userRecord.id).increment('failed_login_attempts', 1)
      }

      throw INVALID_CREDENTIALS
    })

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await db.from('users').where('id', user.id).update({
        failed_login_attempts: 0,
        locked_until: null,
      })
    }

    let requiresPasswordChange = false
    const passwordBaseDate = user.passwordChangedAt ?? user.createdAt
    if (passwordBaseDate) {
      const daysSinceChange = DateTime.now().diff(passwordBaseDate, 'days').days
      if (daysSinceChange > 90) {
        requiresPasswordChange = true
      }
    }

    if (user.twoFactorEnabled) {
      return serialize({
        requiresTwoFactor: true,
        tempToken: createTwoFactorTempToken(user.id),
        requiresPasswordChange,
      })
    }

    const token = await User.accessTokens.create(user)

    return serialize({
      user: UserTransformer.transform(await loadUserAccess(user)),
      token: token.value!.release(),
      requiresPasswordChange,
    })
  }

  @ApiSecurity('bearerAuth')
  @ApiOperation({
    summary: '退出登录',
    description: '删除当前访问 token。',
  })
  @ApiResponse({ status: 200, description: '退出成功' })
  async destroy({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    if (user.currentAccessToken) {
      await User.accessTokens.delete(user, user.currentAccessToken.identifier)
    }

    return {
      message: 'Logged out successfully',
    }
  }
}
