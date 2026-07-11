import type { HttpContext } from '@adonisjs/core/http'

import User from '#models/user'
import { recordAuditEvent } from '#services/audit_log'
import {
  countSuperAdminUsers,
  includesSuperAdminRole,
  isSuperAdmin,
} from '#services/super_admin_access'
import { loadUserAccess } from '#services/user_access'
import { generateInitialPassword } from '#services/user_credentials'
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

function hasSameRoleIds(currentRoleIds: number[], nextRoleIds: number[]) {
  return (
    currentRoleIds.length === nextRoleIds.length &&
    currentRoleIds.every((roleId) => nextRoleIds.includes(roleId))
  )
}

export default class UsersController {
  async index({ serialize }: HttpContext) {
    const users = await User.query()
      .orderBy('id')
      .preload('roles', (roles) => roles.preload('permissions'))
    return serialize(users.map(serializeUserListItem))
  }

  async store(ctx: HttpContext) {
    const { auth, request, response, serialize } = ctx
    const payload = await request.validateUsing(createManagedUserValidator)
    if (await includesSuperAdminRole(payload.roleIds)) {
      return response.forbidden({ message: '超级管理员角色不可授予' })
    }
    if (await User.findBy('email', payload.email)) {
      return response.badRequest({ message: '该邮箱已被使用' })
    }
    const initialPassword = generateInitialPassword()
    const user = await User.create({
      fullName: payload.fullName,
      email: payload.email,
      password: initialPassword,
    })
    await user.related('roles').sync(payload.roleIds)
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'user.created',
      targetType: 'user',
      targetId: user.id,
      metadata: { assignedRoleIds: payload.roleIds },
    })
    return serialize({
      user: UserTransformer.transform(await loadUserAccess(user)),
      initialPassword,
    })
  }

  async update(ctx: HttpContext) {
    const { auth, params, request, response, serialize } = ctx
    const user = await User.findOrFail(params.id)
    await user.load('roles')
    const payload = await request.validateUsing(updateManagedUserValidator)
    const currentUser = auth.getUserOrFail()
    const currentRoleIds = user.roles.map((role) => role.id)
    const targetIsSuperAdmin = user.roles.some((role) => role.code === 'super-admin')
    const actorIsSuperAdmin = await isSuperAdmin(currentUser)
    if (targetIsSuperAdmin && !actorIsSuperAdmin) {
      return response.forbidden({ message: '仅超级管理员可以维护超级管理员账户' })
    }
    if (targetIsSuperAdmin && !hasSameRoleIds(currentRoleIds, payload.roleIds)) {
      return response.badRequest({ message: '超级管理员的角色不可修改' })
    }
    if (!targetIsSuperAdmin && (await includesSuperAdminRole(payload.roleIds))) {
      return response.forbidden({ message: '超级管理员角色不可授予' })
    }
    if (
      user.id === currentUser.id &&
      !user.roles.every((role) => payload.roleIds.includes(role.id))
    ) {
      return response.badRequest({ message: '不能移除当前登录账号的已有角色' })
    }
    const sameEmailUser = await User.findBy('email', payload.email)
    if (sameEmailUser && sameEmailUser.id !== user.id)
      return response.badRequest({ message: '该邮箱已被使用' })
    user.fullName = payload.fullName
    user.email = payload.email
    await user.save()
    await user.related('roles').sync(payload.roleIds)
    await recordAuditEvent(ctx, {
      actorUserId: currentUser.id,
      action: 'user.updated',
      targetType: 'user',
      targetId: user.id,
      metadata: { assignedRoleIds: payload.roleIds },
    })
    return serialize(UserTransformer.transform(await loadUserAccess(user)))
  }

  async resetPassword(ctx: HttpContext) {
    const { auth, params, response, serialize } = ctx
    const user = await User.findOrFail(params.id)
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
