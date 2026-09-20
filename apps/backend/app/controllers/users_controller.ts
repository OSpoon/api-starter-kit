import type { HttpContext } from '@adonisjs/core/http'
import { ApiResponse } from '@foadonis/openapi/decorators'

import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'
import {
  AccessControlMutationError,
  createManagedUser,
  updateManagedUser,
} from '#services/access_control_mutations'
import { recordAuditEvent } from '#services/audit_log'
import { CHANNEL_GUEST_USER_EMAIL, isChannelGuestUser } from '#services/channel_guest_principal'
import { countSuperAdminUsers, isSuperAdmin } from '#services/super_admin_access'
import { loadUserAccess } from '#services/user_access'
import { clampLimit } from '#support/pagination'
import UserTransformer from '#transformers/user_transformer'
import { createManagedUserValidator, updateManagedUserValidator } from '#validators/rbac'

function serializeUserListItem(user: User) {
  const roles = user.roles ?? []
  const permissions = new Set(
    roles.flatMap((role) => role.permissions?.map((permission) => permission.code) ?? [])
  )

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    twoFactorEnabled: user.twoFactorEnabled,
    roles: roles.map((role) => ({ id: role.id, code: role.code, name: role.name })),
    permissions: roles.some((role) => role.code === 'super-admin')
      ? ['*']
      : [...permissions].sort(),
  }
}

export default class UsersController {
  async index({ request, serialize }: HttpContext) {
    const page = Math.max(Number(request.input('page', 1)) || 1, 1)
    const search = String(request.input('search', '')).trim()
    const query = User.query()
      .orderBy('id')
      .preload('roles', (roles) => roles.preload('permissions'))
      .whereNot('email', CHANNEL_GUEST_USER_EMAIL)
    if (search) {
      query.where((builder) => {
        builder.whereILike('full_name', `%${search}%`).orWhereILike('email', `%${search}%`)
      })
    }
    const paginator = await query.paginate(page, clampLimit(request.input('limit'), 20, 100))
    return serialize({
      items: paginator.all().map(serializeUserListItem),
      meta: paginator.getMeta(),
    })
  }

  @ApiResponse({ status: 409, description: '请求包含不存在的角色 ID' })
  async store(ctx: HttpContext) {
    const { auth, request, response, serialize } = ctx
    const payload = await request.validateUsing(createManagedUserValidator)
    if (await User.findBy('email', payload.email)) {
      return response.badRequest({ message: '该邮箱已被使用' })
    }
    const initialPassword = generateInitialPassword()
    let user: User
    try {
      user = await createManagedUser({
        ctx,
        actorUserId: auth.getUserOrFail().id,
        fullName: payload.fullName,
        email: payload.email,
        password: initialPassword,
        roleIds: payload.roleIds,
        source: 'api',
      })
    } catch (error) {
      if (error instanceof AccessControlMutationError && error.code === 'invalid_role_ids') {
        return response.conflict({ message: error.message })
      }
      if (error instanceof AccessControlMutationError && error.code === 'super_admin_role_grant') {
        return response.forbidden({ message: error.message })
      }
      throw error
    }
    return serialize({
      user: UserTransformer.transform(await loadUserAccess(user)),
      initialPassword,
    })
  }

  @ApiResponse({ status: 409, description: '请求包含不存在的角色 ID' })
  async update(ctx: HttpContext) {
    const { auth, params, request, response, serialize } = ctx
    const user = await User.findOrFail(params.id)
    if (isChannelGuestUser(user)) {
      return response.forbidden({ message: '系统内部用户不可管理' })
    }
    const payload = await request.validateUsing(updateManagedUserValidator)
    const currentUser = auth.getUserOrFail()
    const sameEmailUser = await User.findBy('email', payload.email)
    if (sameEmailUser && sameEmailUser.id !== user.id)
      return response.badRequest({ message: '该邮箱已被使用' })
    let updatedUser: User
    try {
      updatedUser = await updateManagedUser({
        ctx,
        actorUserId: currentUser.id,
        userId: user.id,
        fullName: payload.fullName,
        email: payload.email,
        roleIds: payload.roleIds,
        source: 'api',
      })
    } catch (error) {
      if (error instanceof AccessControlMutationError && error.code === 'invalid_role_ids') {
        return response.conflict({ message: error.message })
      }
      if (error instanceof AccessControlMutationError && error.code === 'protected_user') {
        return response.forbidden({ message: error.message })
      }
      if (
        error instanceof AccessControlMutationError &&
        error.code === 'super_admin_target_forbidden'
      ) {
        return response.forbidden({ message: error.message })
      }
      if (error instanceof AccessControlMutationError && error.code === 'super_admin_role_grant') {
        return response.forbidden({ message: error.message })
      }
      if (
        error instanceof AccessControlMutationError &&
        (error.code === 'super_admin_roles_immutable' || error.code === 'self_role_removal')
      ) {
        return response.badRequest({ message: error.message })
      }
      throw error
    }
    return serialize(UserTransformer.transform(await loadUserAccess(updatedUser)))
  }

  async resetPassword(ctx: HttpContext) {
    const { auth, params, response, serialize } = ctx
    const user = await User.findOrFail(params.id)
    if (isChannelGuestUser(user)) {
      return response.forbidden({ message: '系统内部用户不可管理' })
    }
    const currentUser = auth.getUserOrFail()
    if (user.id === currentUser.id) {
      return response.badRequest({ message: '请通过个人资料页面修改当前账号的密码' })
    }
    if ((await isSuperAdmin(user)) && !(await isSuperAdmin(currentUser))) {
      return response.forbidden({ message: '仅超级管理员可以重置超级管理员的密码' })
    }
    const initialPassword = generateInitialPassword()
    user.password = initialPassword
    await user.save()
    await recordAuditEvent(ctx, {
      actorUserId: currentUser.id,
      action: 'user.password_reset',
      targetType: 'user',
      targetId: user.id,
    })
    return serialize({ id: user.id, initialPassword })
  }

  async destroy(ctx: HttpContext) {
    const { auth, params, response, serialize } = ctx
    const user = await User.findOrFail(params.id)
    if (isChannelGuestUser(user)) {
      return response.forbidden({ message: '系统内部用户不可管理' })
    }
    const currentUser = auth.getUserOrFail()
    if (user.id === currentUser.id) return response.badRequest({ message: '不能删除当前登录账号' })
    if (await isSuperAdmin(user)) {
      if (!(await isSuperAdmin(currentUser))) {
        return response.forbidden({ message: '仅超级管理员可以删除超级管理员账户' })
      }
      if ((await countSuperAdminUsers()) <= 1) {
        return response.conflict({ message: '至少需要保留一个超级管理员账户' })
      }
    }
    await user.delete()
    await recordAuditEvent(ctx, {
      actorUserId: currentUser.id,
      action: 'user.deleted',
      targetType: 'user',
      targetId: user.id,
    })
    return serialize({ id: user.id, deleted: true })
  }
}
