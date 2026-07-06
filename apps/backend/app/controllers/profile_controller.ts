import type { HttpContext } from '@adonisjs/core/http'
import hash from '@adonisjs/core/services/hash'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'
import { DateTime } from 'luxon'

import User from '#models/user'
import { isStrongPassword, passwordContext } from '#services/password_strength'
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
    return serialize(UserTransformer.transform(auth.getUserOrFail()))
  }

  @ApiOperation({
    summary: '修改登录密码',
    description: '验证当前密码后修改管理员登录密码，并重新计算密码更新时间。',
  })
  @ApiResponse({ status: 200, description: '已更新的管理员资料' })
  @ApiResponse({ status: 400, description: '当前密码错误或新旧密码相同' })
  @ApiResponse({ status: 422, description: '密码强度不足' })
  async changePassword({ auth, request, response, serialize }: HttpContext) {
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

    user.password = await hash.make(payload.password)
    user.passwordChangedAt = DateTime.now()
    await user.save()

    return serialize(UserTransformer.transform(user))
  }

  @ApiOperation({
    summary: '停用双重身份验证',
    description: '验证登录密码后停用 2FA，并清空 2FA secret 和恢复码。',
  })
  @ApiResponse({ status: 200, description: '已更新的管理员资料' })
  @ApiResponse({ status: 400, description: '密码错误' })
  async disableTwoFactor({ auth, request, response, serialize }: HttpContext) {
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

    return serialize(UserTransformer.transform(user))
  }
}
