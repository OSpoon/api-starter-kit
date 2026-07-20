import { Bouncer } from '@adonisjs/bouncer'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'

import { access } from '#abilities/main'
import type AiAgentConfirmation from '#models/ai_agent_confirmation'
import ApiKey from '#models/api_key'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { recordAuditEvent } from '#services/audit_log'
import { createApiKey } from '#services/api_key_service'
import type { PermissionCode } from '#services/permission_catalog'
import {
  countSuperAdminUsers,
  includesSuperAdminRole,
  isSuperAdmin,
} from '#services/super_admin_access'
import { generateInitialPassword } from '#services/user_credentials'

export type AiAgentActionName =
  | 'revoke_api_key'
  | 'create_api_key'
  | 'reset_user_password'
  | 'disable_user'
  | 'enable_user'
  | 'update_user'
  | 'delete_user'
  | 'create_role'
  | 'update_role'
  | 'delete_role'
  | 'create_permission'
  | 'update_permission'
  | 'delete_permission'

export type AiAgentActionPreparation = {
  targetType: string
  targetId: string
  targetSummary: Record<string, unknown>
  payload: Record<string, unknown>
}

export type AiAgentActionDefinition = {
  permission: PermissionCode
  prepare: (input: Record<string, unknown>) => Promise<AiAgentActionPreparation>
  execute: (input: { confirmation: AiAgentConfirmation; ctx: HttpContext }) => Promise<Record<string, unknown> | void>
}

export class AiAgentActionAuthorizationError extends Error {}

async function ensurePermission(ctx: HttpContext, permission: PermissionCode) {
  const user = ctx.auth.getUserOrFail()
  const bouncer = new Bouncer(() => user, { access })
  if (!(await bouncer.allows('access', permission))) {
    throw new AiAgentActionAuthorizationError('当前账号没有执行此操作的权限')
  }
  return user
}

function integer(input: Record<string, unknown>, name: string) {
  const value = input[name]
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} 无效`)
  }
  return value
}

function string(input: Record<string, unknown>, name: string, maxLength: number) {
  const value = input[name]
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${name} 无效`)
  }
  return value.trim()
}

function optionalDescription(input: Record<string, unknown>) {
  const value = input.description
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.trim().length > 1000) throw new Error('description 无效')
  return value.trim() || null
}

function roleIds(input: Record<string, unknown>) {
  const value = input.roleIds
  if (
    !Array.isArray(value) ||
    value.some((id) => typeof id !== 'number' || !Number.isInteger(id) || id <= 0)
  ) {
    throw new Error('roleIds 无效')
  }
  return value
}

function permissionIds(input: Record<string, unknown>) {
  const value = input.permissionIds
  if (
    !Array.isArray(value) ||
    value.some((id) => typeof id !== 'number' || !Number.isInteger(id) || id <= 0)
  ) {
    throw new Error('permissionIds 无效')
  }
  return value
}

async function ensurePermissionIds(ids: number[]) {
  const permissions = await Permission.query().whereIn('id', ids)
  return permissions.length === ids.length
}

const revokeApiKeyAction: AiAgentActionDefinition = {
  permission: 'api-keys:delete',
  async prepare(input) {
    const apiKey = await ApiKey.find(integer(input, 'apiKeyId'))
    if (!apiKey) throw new Error('API Key 不存在')
    if (apiKey.revokedAt) throw new Error('该 API Key 已被吊销')
    return {
      targetType: 'api_key',
      targetId: String(apiKey.id),
      targetSummary: { name: apiKey.name, prefix: apiKey.prefix },
      payload: { apiKeyId: apiKey.id },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'api-keys:delete')
    const apiKey = await ApiKey.find(integer(confirmation.payload, 'apiKeyId'))
    if (!apiKey || apiKey.revokedAt) throw new Error('API Key 已不存在或已被吊销')
    apiKey.revokedAt = DateTime.now()
    await apiKey.save()
    await recordAuditEvent(ctx, {
      actorUserId: actor.id,
      action: 'agent.api_key_revoked',
      targetType: 'api_key',
      targetId: apiKey.id,
      metadata: { name: apiKey.name, prefix: apiKey.prefix, source: 'ai_agent' },
    })
  },
}

const createApiKeyAction: AiAgentActionDefinition = {
  permission: 'api-keys:create',
  async prepare(input) {
    const name = string(input, 'name', 120)
    const expiresIn = input.expiresIn
    if (expiresIn !== undefined && !['30d', '90d', '180d', 'long'].includes(String(expiresIn)))
      throw new Error('expiresIn 无效')
    return { targetType: 'api_key', targetId: name, targetSummary: { name }, payload: { name, expiresIn } }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'api-keys:create')
    const { apiKey, secret } = await createApiKey({
      name: string(confirmation.payload, 'name', 120),
      expiresIn: confirmation.payload.expiresIn as '30d' | '90d' | '180d' | 'long' | undefined,
    })
    await recordAuditEvent(ctx, { actorUserId: actor.id, action: 'agent.api_key_created', targetType: 'api_key', targetId: apiKey.id, metadata: { name: apiKey.name, prefix: apiKey.prefix, source: 'ai_agent' } })
    return { credential: { kind: 'api_key', value: secret, label: apiKey.name } }
  },
}

function userTargetSummary(user: User) { return { fullName: user.fullName, email: user.email } }

const resetUserPasswordAction: AiAgentActionDefinition = {
  permission: 'users:update',
  async prepare(input) { const user = await User.find(integer(input, 'userId')); if (!user) throw new Error('用户不存在'); return { targetType: 'user', targetId: String(user.id), targetSummary: userTargetSummary(user), payload: { userId: user.id } } },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'users:update'); const user = await User.find(integer(confirmation.payload, 'userId'))
    if (!user) throw new Error('用户不存在'); if (user.id === actor.id) throw new Error('请通过个人资料页面修改当前账号的密码')
    if ((await isSuperAdmin(user)) && !(await isSuperAdmin(actor))) throw new Error('仅超级管理员可以重置超级管理员的密码')
    const password = generateInitialPassword(); user.password = password; await user.save()
    await recordAuditEvent(ctx, { actorUserId: actor.id, action: 'user.password_reset', targetType: 'user', targetId: user.id, metadata: { source: 'ai_agent' } })
    return { credential: { kind: 'password', value: password, label: user.email } }
  },
}

function userEnabledAction(disabled: boolean): AiAgentActionDefinition {
  return {
    permission: 'users:update',
    async prepare(input) { const user = await User.find(integer(input, 'userId')); if (!user) throw new Error('用户不存在'); if (Boolean(user.disabledAt) === disabled) throw new Error(disabled ? '用户已被禁用' : '用户未被禁用'); return { targetType: 'user', targetId: String(user.id), targetSummary: userTargetSummary(user), payload: { userId: user.id } } },
    async execute({ confirmation, ctx }) { const actor = await ensurePermission(ctx, 'users:update'); const user = await User.find(integer(confirmation.payload, 'userId')); if (!user) throw new Error('用户不存在'); if (user.id === actor.id) throw new Error('不能修改当前登录账号的启用状态'); if ((await isSuperAdmin(user)) && !(await isSuperAdmin(actor))) throw new Error('仅超级管理员可以维护超级管理员账户'); if (Boolean(user.disabledAt) === disabled) throw new Error(disabled ? '用户已被禁用' : '用户未被禁用'); user.disabledAt = disabled ? DateTime.now() : null; await user.save(); await recordAuditEvent(ctx, { actorUserId: actor.id, action: disabled ? 'user.disabled' : 'user.enabled', targetType: 'user', targetId: user.id, metadata: { source: 'ai_agent' } }) },
  }
}

const updateUserAction: AiAgentActionDefinition = {
  permission: 'users:update',
  async prepare(input) {
    const user = await User.find(integer(input, 'userId'))
    const nextRoleIds = roleIds(input)
    if (!user) throw new Error('用户不存在')
    if (await includesSuperAdminRole(nextRoleIds)) throw new Error('超级管理员角色不可授予')
    return {
      targetType: 'user',
      targetId: String(user.id),
      targetSummary: { fullName: user.fullName, email: user.email },
      payload: {
        userId: user.id,
        fullName: string(input, 'fullName', 120),
        email: string(input, 'email', 254),
        roleIds: nextRoleIds,
      },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'users:update')
    const payload = confirmation.payload
    const user = await User.find(integer(payload, 'userId'))
    const nextRoleIds = roleIds(payload)
    if (!user) throw new Error('用户不存在')
    await user.load('roles')
    const targetIsSuperAdmin = user.roles.some((role) => role.code === 'super-admin')
    if (targetIsSuperAdmin) throw new Error('超级管理员的角色不可修改')
    if (user.id === actor.id && !user.roles.every((role) => nextRoleIds.includes(role.id)))
      throw new Error('不能移除当前登录账号的已有角色')
    const sameEmail = await User.findBy('email', string(payload, 'email', 254))
    if (sameEmail && sameEmail.id !== user.id) throw new Error('该邮箱已被使用')
    user.fullName = string(payload, 'fullName', 120)
    user.email = string(payload, 'email', 254)
    await user.save()
    await user.related('roles').sync(nextRoleIds)
    await recordAuditEvent(ctx, {
      actorUserId: actor.id,
      action: 'user.updated',
      targetType: 'user',
      targetId: user.id,
      metadata: { assignedRoleIds: nextRoleIds, source: 'ai_agent' },
    })
  },
}

const deleteUserAction: AiAgentActionDefinition = {
  permission: 'users:delete',
  async prepare(input) {
    const user = await User.find(integer(input, 'userId'))
    if (!user) throw new Error('用户不存在')
    return {
      targetType: 'user',
      targetId: String(user.id),
      targetSummary: { fullName: user.fullName, email: user.email },
      payload: { userId: user.id },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'users:delete')
    const user = await User.find(integer(confirmation.payload, 'userId'))
    if (!user) throw new Error('用户不存在')
    if (user.id === actor.id) throw new Error('不能删除当前登录账号')
    if (await isSuperAdmin(user)) {
      if (!(await isSuperAdmin(actor))) throw new Error('仅超级管理员可以删除超级管理员账户')
      if ((await countSuperAdminUsers()) <= 1) throw new Error('至少需要保留一个超级管理员账户')
    }
    await user.delete()
    await recordAuditEvent(ctx, {
      actorUserId: actor.id,
      action: 'user.deleted',
      targetType: 'user',
      targetId: user.id,
      metadata: { source: 'ai_agent' },
    })
  },
}

const createRoleAction: AiAgentActionDefinition = {
  permission: 'roles:create',
  async prepare(input) {
    const code = string(input, 'code', 100)
    if (!/^[a-z0-9-]+$/.test(code) || code.length < 2) throw new Error('角色代码无效')
    if (await Role.findBy('code', code)) throw new Error('角色代码已存在')
    const ids = permissionIds(input)
    if (!(await ensurePermissionIds(ids))) throw new Error('包含不存在的权限')
    return {
      targetType: 'role',
      targetId: code,
      targetSummary: { code, name: string(input, 'name', 120) },
      payload: {
        code,
        name: string(input, 'name', 120),
        description: optionalDescription(input),
        permissionIds: ids,
      },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'roles:create')
    const p = confirmation.payload
    const code = string(p, 'code', 100)
    if (await Role.findBy('code', code)) throw new Error('角色代码已存在')
    const ids = permissionIds(p)
    if (!(await ensurePermissionIds(ids))) throw new Error('包含不存在的权限')
    const role = await Role.create({
      code,
      name: string(p, 'name', 120),
      description: optionalDescription(p),
    })
    await role.related('permissions').sync(ids)
    await recordAuditEvent(ctx, {
      actorUserId: actor.id,
      action: 'role.created',
      targetType: 'role',
      targetId: role.id,
      metadata: { permissionIds: ids, source: 'ai_agent' },
    })
  },
}

const updateRoleAction: AiAgentActionDefinition = {
  permission: 'roles:update',
  async prepare(input) {
    const role = await Role.find(integer(input, 'roleId'))
    if (!role) throw new Error('角色不存在')
    if (role.isSystem) throw new Error('系统内置角色不可编辑')
    const ids = permissionIds(input)
    if (!(await ensurePermissionIds(ids))) throw new Error('包含不存在的权限')
    return {
      targetType: 'role',
      targetId: String(role.id),
      targetSummary: { code: role.code, name: role.name },
      payload: {
        roleId: role.id,
        name: string(input, 'name', 120),
        description: optionalDescription(input),
        permissionIds: ids,
      },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'roles:update')
    const p = confirmation.payload
    const role = await Role.find(integer(p, 'roleId'))
    if (!role || role.isSystem) throw new Error('角色不存在或不可编辑')
    const ids = permissionIds(p)
    if (!(await ensurePermissionIds(ids))) throw new Error('包含不存在的权限')
    role.name = string(p, 'name', 120)
    role.description = optionalDescription(p)
    await role.save()
    await role.related('permissions').sync(ids)
    await recordAuditEvent(ctx, {
      actorUserId: actor.id,
      action: 'role.updated',
      targetType: 'role',
      targetId: role.id,
      metadata: { permissionIds: ids, source: 'ai_agent' },
    })
  },
}

const deleteRoleAction: AiAgentActionDefinition = {
  permission: 'roles:delete',
  async prepare(input) {
    const role = await Role.query()
      .where('id', integer(input, 'roleId'))
      .withCount('users')
      .withCount('permissions')
      .first()
    if (!role) throw new Error('角色不存在')
    if (
      role.isSystem ||
      Number(role.$extras.users_count ?? 0) > 0 ||
      Number(role.$extras.permissions_count ?? 0) > 0
    )
      throw new Error('系统角色、仍被用户使用或仍分配权限的角色不可删除')
    return {
      targetType: 'role',
      targetId: String(role.id),
      targetSummary: { code: role.code, name: role.name },
      payload: { roleId: role.id },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'roles:delete')
    const role = await Role.query()
      .where('id', integer(confirmation.payload, 'roleId'))
      .withCount('users')
      .withCount('permissions')
      .first()
    if (
      !role ||
      role.isSystem ||
      Number(role.$extras.users_count ?? 0) > 0 ||
      Number(role.$extras.permissions_count ?? 0) > 0
    )
      throw new Error('角色不存在、受保护、仍被用户使用或仍分配权限')
    await role.delete()
    await recordAuditEvent(ctx, {
      actorUserId: actor.id,
      action: 'role.deleted',
      targetType: 'role',
      targetId: role.id,
      metadata: { source: 'ai_agent' },
    })
  },
}

const createPermissionAction: AiAgentActionDefinition = {
  permission: 'permissions:create',
  async prepare(input) {
    const code = string(input, 'code', 100)
    if (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(code)) throw new Error('权限代码无效')
    if (await Permission.findBy('code', code)) throw new Error('权限代码已存在')
    return {
      targetType: 'permission',
      targetId: code,
      targetSummary: { code, name: string(input, 'name', 120) },
      payload: {
        code,
        name: string(input, 'name', 120),
        groupName: string(input, 'groupName', 120),
        description: optionalDescription(input),
      },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'permissions:create')
    const p = confirmation.payload
    const code = string(p, 'code', 100)
    if (await Permission.findBy('code', code)) throw new Error('权限代码已存在')
    const permission = await Permission.create({
      code,
      name: string(p, 'name', 120),
      groupName: string(p, 'groupName', 120),
      description: optionalDescription(p),
    })
    await recordAuditEvent(ctx, {
      actorUserId: actor.id,
      action: 'permission.created',
      targetType: 'permission',
      targetId: permission.id,
      metadata: { code, source: 'ai_agent' },
    })
  },
}

const updatePermissionAction: AiAgentActionDefinition = {
  permission: 'permissions:update',
  async prepare(input) {
    const permission = await Permission.find(integer(input, 'permissionId'))
    if (!permission || permission.isSystem) throw new Error('权限不存在或不可编辑')
    return {
      targetType: 'permission',
      targetId: String(permission.id),
      targetSummary: { code: permission.code, name: permission.name },
      payload: {
        permissionId: permission.id,
        name: string(input, 'name', 120),
        groupName: string(input, 'groupName', 120),
        description: optionalDescription(input),
      },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'permissions:update')
    const p = confirmation.payload
    const permission = await Permission.find(integer(p, 'permissionId'))
    if (!permission || permission.isSystem) throw new Error('权限不存在或不可编辑')
    permission.name = string(p, 'name', 120)
    permission.groupName = string(p, 'groupName', 120)
    permission.description = optionalDescription(p)
    await permission.save()
    await recordAuditEvent(ctx, {
      actorUserId: actor.id,
      action: 'permission.updated',
      targetType: 'permission',
      targetId: permission.id,
      metadata: { code: permission.code, source: 'ai_agent' },
    })
  },
}

const deletePermissionAction: AiAgentActionDefinition = {
  permission: 'permissions:delete',
  async prepare(input) {
    const permission = await Permission.query()
      .where('id', integer(input, 'permissionId'))
      .withCount('roles')
      .first()
    if (!permission) throw new Error('权限不存在')
    if (permission.isSystem || Number(permission.$extras.roles_count ?? 0) > 0)
      throw new Error('系统权限或仍被角色引用的权限不可删除')
    return {
      targetType: 'permission',
      targetId: String(permission.id),
      targetSummary: { code: permission.code, name: permission.name },
      payload: { permissionId: permission.id },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'permissions:delete')
    const permission = await Permission.query()
      .where('id', integer(confirmation.payload, 'permissionId'))
      .withCount('roles')
      .first()
    if (!permission || permission.isSystem || Number(permission.$extras.roles_count ?? 0) > 0)
      throw new Error('权限不存在、受保护或仍被角色引用')
    await permission.delete()
    await recordAuditEvent(ctx, {
      actorUserId: actor.id,
      action: 'permission.deleted',
      targetType: 'permission',
      targetId: permission.id,
      metadata: { code: permission.code, source: 'ai_agent' },
    })
  },
}

const aiAgentActions: Record<AiAgentActionName, AiAgentActionDefinition> = {
  revoke_api_key: revokeApiKeyAction,
  create_api_key: createApiKeyAction,
  reset_user_password: resetUserPasswordAction,
  disable_user: userEnabledAction(true),
  enable_user: userEnabledAction(false),
  update_user: updateUserAction,
  delete_user: deleteUserAction,
  create_role: createRoleAction,
  update_role: updateRoleAction,
  delete_role: deleteRoleAction,
  create_permission: createPermissionAction,
  update_permission: updatePermissionAction,
  delete_permission: deletePermissionAction,
}

export function getAiAgentAction(action: string) {
  return aiAgentActions[action as AiAgentActionName] ?? null
}
