import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { recordAuditEvent } from '#services/audit_log'
import { isChannelGuestUser } from '#services/channel_guest_principal'

export type MutationSource = 'api' | 'ai_agent'

export class AccessControlMutationError extends Error {
  constructor(
    readonly code:
      | 'invalid_role_ids'
      | 'invalid_permission_ids'
      | 'duplicate_role_code'
      | 'protected_role'
      | 'protected_user'
      | 'super_admin_target_forbidden'
      | 'super_admin_roles_immutable'
      | 'super_admin_role_grant'
      | 'self_role_removal',
    message: string
  ) {
    super(message)
  }
}

function uniqueIds(ids: number[]) {
  return [...new Set(ids)]
}

async function resolveRoleIds(ids: number[], client: TransactionClientContract) {
  const normalizedIds = uniqueIds(ids)
  const roles = normalizedIds.length
    ? await Role.query({ client }).whereIn('id', normalizedIds).select('id', 'code').forUpdate()
    : []
  if (roles.length !== normalizedIds.length) {
    throw new AccessControlMutationError('invalid_role_ids', '包含不存在的角色')
  }
  return { ids: normalizedIds, roles }
}

async function resolveCurrentRoles(user: User) {
  return user.related('roles').query().select('roles.id', 'roles.code').forUpdate()
}

async function validateUserRoleChange(input: {
  actorUserId: number
  target: User
  nextRoleIds: number[]
  nextRoles: Role[]
  client: TransactionClientContract
}) {
  const targetRoles = await resolveCurrentRoles(input.target)
  const actor =
    input.actorUserId === input.target.id
      ? input.target
      : await User.query({ client: input.client })
          .where('id', input.actorUserId)
          .forUpdate()
          .firstOrFail()
  const actorRoles = actor.id === input.target.id ? targetRoles : await resolveCurrentRoles(actor)
  const targetRoleIds = targetRoles.map((role) => role.id)
  const targetIsSuperAdmin = targetRoles.some((role) => role.code === 'super-admin')
  const actorIsSuperAdmin = actorRoles.some((role) => role.code === 'super-admin')

  if (targetIsSuperAdmin) {
    if (!actorIsSuperAdmin) {
      throw new AccessControlMutationError(
        'super_admin_target_forbidden',
        '仅超级管理员可以维护超级管理员账户'
      )
    }
    if (
      targetRoleIds.length !== input.nextRoleIds.length ||
      targetRoleIds.some((roleId) => !input.nextRoleIds.includes(roleId))
    ) {
      throw new AccessControlMutationError(
        'super_admin_roles_immutable',
        '超级管理员的角色不可修改'
      )
    }
  } else if (input.nextRoles.some((role) => role.code === 'super-admin')) {
    throw new AccessControlMutationError('super_admin_role_grant', '超级管理员角色不可授予')
  }

  if (
    actor.id === input.target.id &&
    targetRoleIds.some((roleId) => !input.nextRoleIds.includes(roleId))
  ) {
    throw new AccessControlMutationError('self_role_removal', '不能移除当前登录账号的已有角色')
  }
}

async function resolvePermissionIds(ids: number[], client: TransactionClientContract) {
  const normalizedIds = uniqueIds(ids)
  const permissions = normalizedIds.length
    ? await Permission.query({ client }).whereIn('id', normalizedIds).select('id')
    : []
  if (permissions.length !== normalizedIds.length) {
    throw new AccessControlMutationError('invalid_permission_ids', '包含不存在的权限')
  }
  return normalizedIds
}

export async function createRoleWithPermissions(input: {
  ctx: HttpContext
  actorUserId: number
  code: string
  name: string
  description: string | null
  permissionIds: number[]
  source: MutationSource
}) {
  return db.transaction(async (trx) => {
    const existingRole = await Role.query({ client: trx }).where('code', input.code).first()
    if (existingRole) {
      throw new AccessControlMutationError('duplicate_role_code', '角色代码已存在')
    }
    const permissionIds = await resolvePermissionIds(input.permissionIds, trx)
    const role = await Role.create(
      { code: input.code, name: input.name, description: input.description },
      { client: trx }
    )
    await role.related('permissions').sync(permissionIds, false, trx)
    await recordAuditEvent(
      input.ctx,
      {
        actorUserId: input.actorUserId,
        action: 'role.created',
        targetType: 'role',
        targetId: role.id,
        metadata: { permissionIds, source: input.source },
      },
      trx
    )
    return role
  })
}

export async function createManagedUser(input: {
  ctx: HttpContext
  actorUserId: number
  fullName: string
  email: string
  password: string
  roleIds: number[]
  source: MutationSource
}) {
  return db.transaction(async (trx) => {
    const resolvedRoles = await resolveRoleIds(input.roleIds, trx)
    if (resolvedRoles.roles.some((role) => role.code === 'super-admin')) {
      throw new AccessControlMutationError('super_admin_role_grant', '超级管理员角色不可授予')
    }
    const user = await User.create(
      { fullName: input.fullName, email: input.email, password: input.password },
      { client: trx }
    )
    await user.related('roles').sync(resolvedRoles.ids, false, trx)
    await recordAuditEvent(
      input.ctx,
      {
        actorUserId: input.actorUserId,
        action: 'user.created',
        targetType: 'user',
        targetId: user.id,
        metadata: { assignedRoleIds: resolvedRoles.ids, source: input.source },
      },
      trx
    )
    return user
  })
}

export async function updateManagedUser(input: {
  ctx: HttpContext
  actorUserId: number
  userId: number
  fullName: string
  email: string
  roleIds: number[]
  source: MutationSource
}) {
  return db.transaction(async (trx) => {
    const user = await User.query({ client: trx })
      .where('id', input.userId)
      .forUpdate()
      .firstOrFail()
    if (isChannelGuestUser(user)) {
      throw new AccessControlMutationError('protected_user', '系统内部用户不可管理')
    }
    const resolvedRoles = await resolveRoleIds(input.roleIds, trx)
    await validateUserRoleChange({
      actorUserId: input.actorUserId,
      target: user,
      nextRoleIds: resolvedRoles.ids,
      nextRoles: resolvedRoles.roles,
      client: trx,
    })
    user.fullName = input.fullName
    user.email = input.email
    await user.save()
    await user.related('roles').sync(resolvedRoles.ids, false, trx)
    await recordAuditEvent(
      input.ctx,
      {
        actorUserId: input.actorUserId,
        action: 'user.updated',
        targetType: 'user',
        targetId: user.id,
        metadata: { assignedRoleIds: resolvedRoles.ids, source: input.source },
      },
      trx
    )
    return user
  })
}

export async function updateRoleWithPermissions(input: {
  ctx: HttpContext
  actorUserId: number
  roleId: number
  name: string
  description: string | null
  permissionIds?: number[]
  source: MutationSource
}) {
  return db.transaction(async (trx) => {
    const role = await Role.query({ client: trx }).where('id', input.roleId).firstOrFail()
    if (role.isSystem) {
      throw new AccessControlMutationError('protected_role', '系统内置角色不可编辑')
    }
    const permissionIds =
      input.permissionIds === undefined
        ? undefined
        : await resolvePermissionIds(input.permissionIds, trx)

    role.name = input.name
    role.description = input.description
    await role.save()
    if (permissionIds !== undefined) {
      await role.related('permissions').sync(permissionIds, false, trx)
    }
    await recordAuditEvent(
      input.ctx,
      {
        actorUserId: input.actorUserId,
        action: 'role.updated',
        targetType: 'role',
        targetId: role.id,
        metadata: { permissionIds: permissionIds ?? [], source: input.source },
      },
      trx
    )
    return role
  })
}
