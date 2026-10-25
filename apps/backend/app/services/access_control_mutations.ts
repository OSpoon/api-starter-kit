import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'

import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { recordAuditEvent } from '#services/audit_log'
import { isInternalUser } from '#services/channel_guest_principal'
import { permissionCatalogCodes } from '#services/permission_catalog'
import { countEnabledSuperAdminUsers, lockSuperAdminRole } from '#services/super_admin_access'

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
      | 'self_role_removal'
      | 'grant_exceeds_actor_permissions'
      | 'inactive_actor'
      | 'last_enabled_super_admin',
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
    ? await Role.query({ client })
        .whereIn('id', normalizedIds)
        .select('id', 'code')
        .preload('permissions')
        .forUpdate()
    : []
  if (roles.length !== normalizedIds.length) {
    throw new AccessControlMutationError('invalid_role_ids', '包含不存在的角色')
  }
  return { ids: normalizedIds, roles }
}

async function resolveCurrentRoles(user: User) {
  return user
    .related('roles')
    .query()
    .select('roles.id', 'roles.code')
    .preload('permissions')
    .forUpdate()
}

function permissionCodes(roles: Role[]) {
  return new Set(roles.flatMap((role) => role.permissions.map((permission) => permission.code)))
}

function ensureGrantablePermissions(actorRoles: Role[], requestedCodes: string[]) {
  if (actorRoles.some((role) => role.code === 'super-admin')) return
  const actorPermissionCodes = permissionCodes(actorRoles)
  if (requestedCodes.some((code) => !actorPermissionCodes.has(code))) {
    throw new AccessControlMutationError(
      'grant_exceeds_actor_permissions',
      '只能授予自己拥有的权限'
    )
  }
}

async function loadActorRolesForGrant(actorUserId: number) {
  const actor = await User.query()
    .where('id', actorUserId)
    .preload('roles', (roles) => roles.preload('permissions'))
    .firstOrFail()
  if (actor.disabledAt) {
    throw new AccessControlMutationError('inactive_actor', '已停用的用户不能执行此操作')
  }
  return actor.roles
}

export async function assertGrantablePermissionIds(actorUserId: number, ids: number[]) {
  const normalizedIds = uniqueIds(ids)
  const permissions = normalizedIds.length
    ? await Permission.query().whereIn('id', normalizedIds).whereIn('code', permissionCatalogCodes)
    : []
  if (permissions.length !== normalizedIds.length) {
    throw new AccessControlMutationError('invalid_permission_ids', '包含未注册或不存在的权限')
  }
  ensureGrantablePermissions(
    await loadActorRolesForGrant(actorUserId),
    permissions.map((permission) => permission.code)
  )
}

export async function assertGrantableRoleIds(actorUserId: number, ids: number[]) {
  const normalizedIds = uniqueIds(ids)
  const roles = normalizedIds.length
    ? await Role.query().whereIn('id', normalizedIds).preload('permissions')
    : []
  if (roles.length !== normalizedIds.length) {
    throw new AccessControlMutationError('invalid_role_ids', '包含不存在的角色')
  }
  if (roles.some((role) => role.code === 'super-admin')) {
    throw new AccessControlMutationError('super_admin_role_grant', '超级管理员角色不可授予')
  }
  ensureGrantablePermissions(
    await loadActorRolesForGrant(actorUserId),
    roles.flatMap((role) => role.permissions.map((permission) => permission.code))
  )
}

async function resolveActorRoles(actorUserId: number, client: TransactionClientContract) {
  const actor = await User.query({ client })
    .where('id', actorUserId)
    .forUpdate()
    .preload('roles', (roles) => roles.preload('permissions'))
    .firstOrFail()
  if (actor.disabledAt) {
    throw new AccessControlMutationError('inactive_actor', '已停用的用户不能执行此操作')
  }
  return actor.roles
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
          .preload('roles', (roles) => roles.preload('permissions'))
          .firstOrFail()
  if (actor.disabledAt) {
    throw new AccessControlMutationError('inactive_actor', '已停用的用户不能执行此操作')
  }
  const actorRoles = actor.id === input.target.id ? targetRoles : await resolveCurrentRoles(actor)
  const targetRoleIds = targetRoles.map((role) => role.id)
  const targetIsSuperAdmin = targetRoles.some((role) => role.code === 'super-admin')
  const actorIsSuperAdmin = actorRoles.some((role) => role.code === 'super-admin')

  ensureGrantablePermissions(
    actorRoles,
    input.nextRoles.flatMap((role) => role.permissions.map((permission) => permission.code))
  )

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

async function resolvePermissions(ids: number[], client: TransactionClientContract) {
  const normalizedIds = uniqueIds(ids)
  const permissions = normalizedIds.length
    ? await Permission.query({ client })
        .whereIn('id', normalizedIds)
        .whereIn('code', permissionCatalogCodes)
        .select('id', 'code')
    : []
  if (permissions.length !== normalizedIds.length) {
    throw new AccessControlMutationError('invalid_permission_ids', '包含未注册或不存在的权限')
  }
  return { ids: normalizedIds, codes: permissions.map((permission) => permission.code) }
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
    const permissions = await resolvePermissions(input.permissionIds, trx)
    const actorRoles = await resolveActorRoles(input.actorUserId, trx)
    ensureGrantablePermissions(actorRoles, permissions.codes)
    const role = await Role.create(
      { code: input.code, name: input.name, description: input.description },
      { client: trx }
    )
    await role.related('permissions').sync(permissions.ids, false, trx)
    await recordAuditEvent(
      input.ctx,
      {
        actorUserId: input.actorUserId,
        action: 'role.created',
        targetType: 'role',
        targetId: role.id,
        metadata: { permissionIds: permissions.ids, source: input.source },
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
    const actorRoles = await resolveActorRoles(input.actorUserId, trx)
    if (resolvedRoles.roles.some((role) => role.code === 'super-admin')) {
      throw new AccessControlMutationError('super_admin_role_grant', '超级管理员角色不可授予')
    }
    ensureGrantablePermissions(
      actorRoles,
      resolvedRoles.roles.flatMap((role) => role.permissions.map((permission) => permission.code))
    )
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
    if (isInternalUser(user)) {
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

export async function deleteManagedUser(input: {
  ctx: HttpContext
  actorUserId: number
  userId: number
  source: MutationSource
}) {
  return db.transaction(async (trx) => {
    const superAdminRole = await lockSuperAdminRole(trx)
    const user = await User.query({ client: trx })
      .where('id', input.userId)
      .forUpdate()
      .firstOrFail()
    if (isInternalUser(user)) {
      throw new AccessControlMutationError('protected_user', '系统内部用户不可管理')
    }
    if (user.id === input.actorUserId) {
      throw new AccessControlMutationError('protected_user', '不能删除当前登录账号')
    }
    const actor = await User.query({ client: trx })
      .where('id', input.actorUserId)
      .forUpdate()
      .firstOrFail()
    if (actor.disabledAt) {
      throw new AccessControlMutationError('inactive_actor', '已停用的用户不能执行此操作')
    }
    const targetRoles = await resolveCurrentRoles(user)
    const targetIsSuperAdmin = targetRoles.some((role) => role.id === superAdminRole.id)
    const actorRoles = await resolveCurrentRoles(actor)
    const actorIsSuperAdmin = actorRoles.some((role) => role.id === superAdminRole.id)
    if (targetIsSuperAdmin && !actorIsSuperAdmin) {
      throw new AccessControlMutationError(
        'super_admin_target_forbidden',
        '仅超级管理员可以删除超级管理员账户'
      )
    }
    if (
      targetIsSuperAdmin &&
      !user.disabledAt &&
      (await countEnabledSuperAdminUsers(trx, superAdminRole.id)) <= 1
    ) {
      throw new AccessControlMutationError(
        'last_enabled_super_admin',
        '至少需要保留一个启用的超级管理员账户'
      )
    }
    user.useTransaction(trx)
    await trx.from('user_roles').where('user_id', user.id).delete()
    await user.delete()
    await recordAuditEvent(
      input.ctx,
      {
        actorUserId: input.actorUserId,
        action: 'user.deleted',
        targetType: 'user',
        targetId: user.id,
        metadata: { source: input.source },
      },
      trx
    )
    return user.id
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
    const role = await Role.query({ client: trx })
      .where('id', input.roleId)
      .forUpdate()
      .firstOrFail()
    if (role.isSystem) {
      throw new AccessControlMutationError('protected_role', '系统内置角色不可编辑')
    }
    const permissions =
      input.permissionIds === undefined
        ? undefined
        : await resolvePermissions(input.permissionIds, trx)
    if (permissions) {
      const actorRoles = await resolveActorRoles(input.actorUserId, trx)
      ensureGrantablePermissions(actorRoles, permissions.codes)
    }

    role.name = input.name
    role.description = input.description
    await role.save()
    if (permissions !== undefined) {
      await role.related('permissions').sync(permissions.ids, false, trx)
    }
    await recordAuditEvent(
      input.ctx,
      {
        actorUserId: input.actorUserId,
        action: 'role.updated',
        targetType: 'role',
        targetId: role.id,
        metadata: { permissionIds: permissions?.ids ?? [], source: input.source },
      },
      trx
    )
    return role
  })
}

export async function setManagedUserDisabled(input: {
  ctx: HttpContext
  actorUserId: number
  userId: number
  disabled: boolean
  source: MutationSource
}) {
  return db.transaction(async (trx) => {
    const superAdminRole = await lockSuperAdminRole(trx)
    const target = await User.query({ client: trx })
      .where('id', input.userId)
      .forUpdate()
      .firstOrFail()
    if (isInternalUser(target)) {
      throw new AccessControlMutationError('protected_user', '系统内部用户不可管理')
    }
    if (target.id === input.actorUserId) {
      throw new AccessControlMutationError('protected_user', '不能修改当前登录账号的启用状态')
    }
    if (Boolean(target.disabledAt) === input.disabled) {
      throw new AccessControlMutationError(
        'protected_user',
        input.disabled ? '用户已被禁用' : '用户未被禁用'
      )
    }

    const actor = await User.query({ client: trx })
      .where('id', input.actorUserId)
      .forUpdate()
      .firstOrFail()
    if (actor.disabledAt) {
      throw new AccessControlMutationError('inactive_actor', '已停用的用户不能执行此操作')
    }
    const targetRoles = await resolveCurrentRoles(target)
    const actorRoles = await resolveCurrentRoles(actor)
    const targetIsSuperAdmin = targetRoles.some((role) => role.id === superAdminRole.id)
    const actorIsSuperAdmin = actorRoles.some((role) => role.id === superAdminRole.id)
    if (targetIsSuperAdmin && !actorIsSuperAdmin) {
      throw new AccessControlMutationError(
        'super_admin_target_forbidden',
        '仅超级管理员可以维护超级管理员账户'
      )
    }
    if (
      input.disabled &&
      targetIsSuperAdmin &&
      (await countEnabledSuperAdminUsers(trx, superAdminRole.id)) <= 1
    ) {
      throw new AccessControlMutationError(
        'last_enabled_super_admin',
        '至少需要保留一个启用的超级管理员账户'
      )
    }

    target.disabledAt = input.disabled ? DateTime.now() : null
    await target.save()
    if (input.disabled) {
      await trx.from('auth_access_tokens').where('tokenable_id', target.id).delete()
    }
    await recordAuditEvent(
      input.ctx,
      {
        actorUserId: actor.id,
        action: input.disabled ? 'user.disabled' : 'user.enabled',
        targetType: 'user',
        targetId: target.id,
        metadata: { source: input.source },
      },
      trx
    )
  })
}
