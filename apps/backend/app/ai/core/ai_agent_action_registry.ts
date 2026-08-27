import type { HttpContext } from '@adonisjs/core/http'
import encryption from '@adonisjs/core/services/encryption'
import { DateTime } from 'luxon'
import { z } from 'zod'

import { ensureAiAgentPermission } from '#ai/core/ai_agent_authorization'
import type AiAgentConfirmation from '#models/ai_agent_confirmation'
import ApiKey from '#models/api_key'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import WecomMessageTemplate from '#models/wecom_message_template'
import { generateInitialPassword } from '#security/user_credentials'
import { createApiKey } from '#services/api_key_service'
import { recordAuditEvent } from '#services/audit_log'
import {
  countSuperAdminUsers,
  includesSuperAdminRole,
  isSuperAdmin,
} from '#services/super_admin_access'
import {
  applyWecomRuntimeMentions,
  renderWecomPayload,
  sendWecomMessageTemplate,
  validateTemplateParameters,
  validateWecomTemplatePayload,
} from '#services/wecom_message_template_service'

export type AiAgentActionName =
  | 'revoke_api_key'
  | 'delete_api_key'
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
  | 'send_wecom_message'

export type AiAgentActionPreparation = {
  targetType: string
  targetId: string
  targetSummary: Record<string, unknown>
  payload: Record<string, unknown>
}

export type AiAgentActionImpact = 'standard' | 'destructive'

export type AiAgentActionDefinition = {
  permission: string
  impact: AiAgentActionImpact
  prepare: (input: Record<string, unknown>) => Promise<AiAgentActionPreparation>
  execute: (input: {
    confirmation: AiAgentConfirmation
    ctx: HttpContext
  }) => Promise<Record<string, unknown> | void>
}

type AiAgentActionImplementation = Omit<AiAgentActionDefinition, 'impact'>

export class AiAgentActionAuthorizationError extends Error {}

export const aiAgentActionNames = [
  'revoke_api_key',
  'delete_api_key',
  'create_api_key',
  'reset_user_password',
  'disable_user',
  'enable_user',
  'update_user',
  'delete_user',
  'create_role',
  'update_role',
  'delete_role',
  'create_permission',
  'update_permission',
  'delete_permission',
  'send_wecom_message',
] as const

// API Key revocation and deletion are exposed to the model as two dedicated
// proposal tools instead of actions inside the generic management tool, so the
// model's choice between them is explicit and never merged.
export const genericProposalActionNames = [
  'create_api_key',
  'reset_user_password',
  'disable_user',
  'enable_user',
  'update_user',
  'delete_user',
  'create_role',
  'update_role',
  'delete_role',
  'create_permission',
  'update_permission',
  'delete_permission',
] as const

const destructiveActionNames = new Set<AiAgentActionName>([
  'revoke_api_key',
  'delete_api_key',
  'reset_user_password',
  'disable_user',
  'delete_user',
  'delete_role',
  'delete_permission',
])

// Keep the model-facing tool schema compact. The registered action's
// preparation function remains the authoritative validator for every field,
// target lookup, and conflict condition before a proposal is persisted.
export const aiAgentChangeSchema = z.object({
  action: z.enum(genericProposalActionNames),
  input: z
    .record(z.unknown())
    .refine((value) => Object.keys(value).length > 0, '受控操作缺少必要参数'),
})

// Shared schema for the dedicated API Key revocation and deletion tools. The
// preparation function still resolves the target and validates its state.
export const aiApiKeyChangeSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const directInput = value as Record<string, unknown>
    const nested =
      directInput.input &&
      typeof directInput.input === 'object' &&
      !Array.isArray(directInput.input)
        ? (directInput.input as Record<string, unknown>)
        : {}
    return { ...nested, ...directInput }
  },
  z
    .object({
      apiKeyId: z.coerce.number().int().positive().optional(),
      id: z.coerce.number().int().positive().optional(),
      name: z.string().trim().min(1).max(120).optional(),
    })
    .refine(
      (input) =>
        [input.apiKeyId, input.id, input.name].filter((value) => value !== undefined).length === 1,
      '请将 API Key 的正整数 ID 或精确名称作为工具参数传入（二选一）'
    )
)

async function ensurePermission(ctx: HttpContext, permission: string) {
  const user = ctx.auth.getUserOrFail()
  try {
    await ensureAiAgentPermission(user.id, permission)
  } catch {
    throw new AiAgentActionAuthorizationError('当前账号没有执行此操作的权限')
  }
  return user
}

function integer(input: Record<string, unknown>, name: string, aliases: string[] = []) {
  const value = [input[name], ...aliases.map((alias) => input[alias])].find(
    (candidate) => candidate !== undefined && candidate !== null
  )
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value.trim())
        : Number.NaN
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} 无效`)
  }
  return parsed
}

async function resolveApiKeyId(input: Record<string, unknown>) {
  const value = [input.apiKeyId, input.id].find((candidate) => candidate !== undefined)
  if (value !== undefined) return integer({ apiKeyId: value }, 'apiKeyId')
  if (input.name === undefined) {
    throw new Error('请提供 API Key 的精确名称或正整数 ID')
  }
  const name = string(input, 'name', 120)
  const matches = await ApiKey.query().where('name', name).limit(2)
  if (matches.length === 0) throw new Error('API Key 不存在')
  if (matches.length > 1) throw new Error('存在多个同名 API Key，请提供 apiKeyId')
  return matches[0].id
}

async function resolveUserId(input: Record<string, unknown>) {
  const value = input.userId
  if (value !== undefined) return integer({ userId: value }, 'userId')
  const email = string(input, 'email', 254)
  const user = await User.findBy('email', email)
  if (!user) throw new Error('用户不存在')
  return user.id
}

async function resolveRoleId(input: Record<string, unknown>) {
  const value = input.roleId
  if (value !== undefined) return integer({ roleId: value }, 'roleId')
  const code = string(input, 'code', 100)
  const role = await Role.findBy('code', code)
  if (!role) throw new Error('角色不存在')
  return role.id
}

async function resolvePermissionId(input: Record<string, unknown>) {
  const value = input.permissionId
  if (value !== undefined) return integer({ permissionId: value }, 'permissionId')
  const code = string(input, 'code', 100)
  const permission = await Permission.findBy('code', code)
  if (!permission) throw new Error('权限不存在')
  return permission.id
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

function record(input: Record<string, unknown>, name: string) {
  const value = input[name]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} 无效`)
  }
  return value as Record<string, unknown>
}

function stringList(input: Record<string, unknown>, name: string) {
  const value = input[name]
  if (value === undefined) return undefined
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 120)
  ) {
    throw new Error(`${name} 无效`)
  }
  return value.map((item) => item.trim())
}

async function ensurePermissionIds(ids: number[]) {
  const permissions = await Permission.query().whereIn('id', ids)
  return permissions.length === ids.length
}

const revokeApiKeyAction: AiAgentActionImplementation = {
  permission: 'api-keys:delete',
  async prepare(input) {
    // Small models commonly use the visible table's generic `id` field. The
    // canonical payload remains apiKeyId after validation and target lookup.
    const apiKey = await ApiKey.find(await resolveApiKeyId(input))
    if (!apiKey) throw new Error('API Key 不存在')
    if (apiKey.revokedAt) throw new Error('该 API Key 已被吊销，如需删除请改用 delete_api_key 操作')
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

const deleteApiKeyAction: AiAgentActionImplementation = {
  permission: 'api-keys:delete',
  async prepare(input) {
    const apiKey = await ApiKey.find(await resolveApiKeyId(input))
    if (!apiKey) throw new Error('API Key 不存在')
    if (!apiKey.revokedAt)
      throw new Error('仅已吊销的 API Key 可被删除，请改用 revoke_api_key 操作')
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
    if (!apiKey || !apiKey.revokedAt) throw new Error('API Key 不存在或未被吊销')
    await apiKey.delete()
    await recordAuditEvent(ctx, {
      actorUserId: actor.id,
      action: 'agent.api_key_deleted',
      targetType: 'api_key',
      targetId: apiKey.id,
      metadata: { name: apiKey.name, prefix: apiKey.prefix, source: 'ai_agent' },
    })
  },
}

const createApiKeyAction: AiAgentActionImplementation = {
  permission: 'api-keys:create',
  async prepare(input) {
    const name = string(input, 'name', 120)
    const expiresIn = input.expiresIn
    if (expiresIn !== undefined && !['30d', '90d', '180d', 'long'].includes(String(expiresIn)))
      throw new Error('expiresIn 无效')
    return {
      targetType: 'api_key',
      targetId: name,
      targetSummary: { name },
      payload: { name, expiresIn },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'api-keys:create')
    const { apiKey, secret } = await createApiKey({
      name: string(confirmation.payload, 'name', 120),
      expiresIn: confirmation.payload.expiresIn as '30d' | '90d' | '180d' | 'long' | undefined,
    })
    await recordAuditEvent(ctx, {
      actorUserId: actor.id,
      action: 'agent.api_key_created',
      targetType: 'api_key',
      targetId: apiKey.id,
      metadata: { name: apiKey.name, prefix: apiKey.prefix, source: 'ai_agent' },
    })
    return {
      credential: { kind: 'api_key', value: secret, label: apiKey.name },
      apiKeyId: apiKey.id,
    }
  },
}

function userTargetSummary(user: User) {
  return { fullName: user.fullName, email: user.email }
}

const resetUserPasswordAction: AiAgentActionImplementation = {
  permission: 'users:update',
  async prepare(input) {
    const user = await User.find(await resolveUserId(input))
    if (!user) throw new Error('用户不存在')
    return {
      targetType: 'user',
      targetId: String(user.id),
      targetSummary: userTargetSummary(user),
      payload: { userId: user.id },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'users:update')
    const user = await User.find(integer(confirmation.payload, 'userId'))
    if (!user) throw new Error('用户不存在')
    if (user.id === actor.id) throw new Error('请通过个人资料页面修改当前账号的密码')
    if ((await isSuperAdmin(user)) && !(await isSuperAdmin(actor)))
      throw new Error('仅超级管理员可以重置超级管理员的密码')
    const password = generateInitialPassword()
    user.password = password
    await user.save()
    await recordAuditEvent(ctx, {
      actorUserId: actor.id,
      action: 'user.password_reset',
      targetType: 'user',
      targetId: user.id,
      metadata: { source: 'ai_agent' },
    })
    return { credential: { kind: 'password', value: password, label: user.email } }
  },
}

function userEnabledAction(disabled: boolean): AiAgentActionImplementation {
  return {
    permission: 'users:update',
    async prepare(input) {
      const user = await User.find(await resolveUserId(input))
      if (!user) throw new Error('用户不存在')
      if (Boolean(user.disabledAt) === disabled)
        throw new Error(disabled ? '用户已被禁用' : '用户未被禁用')
      return {
        targetType: 'user',
        targetId: String(user.id),
        targetSummary: userTargetSummary(user),
        payload: { userId: user.id },
      }
    },
    async execute({ confirmation, ctx }) {
      const actor = await ensurePermission(ctx, 'users:update')
      const user = await User.find(integer(confirmation.payload, 'userId'))
      if (!user) throw new Error('用户不存在')
      if (user.id === actor.id) throw new Error('不能修改当前登录账号的启用状态')
      if ((await isSuperAdmin(user)) && !(await isSuperAdmin(actor)))
        throw new Error('仅超级管理员可以维护超级管理员账户')
      if (Boolean(user.disabledAt) === disabled)
        throw new Error(disabled ? '用户已被禁用' : '用户未被禁用')
      user.disabledAt = disabled ? DateTime.now() : null
      await user.save()
      await recordAuditEvent(ctx, {
        actorUserId: actor.id,
        action: disabled ? 'user.disabled' : 'user.enabled',
        targetType: 'user',
        targetId: user.id,
        metadata: { source: 'ai_agent' },
      })
    },
  }
}

const updateUserAction: AiAgentActionImplementation = {
  permission: 'users:update',
  async prepare(input) {
    const user = await User.find(await resolveUserId(input))
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

const deleteUserAction: AiAgentActionImplementation = {
  permission: 'users:delete',
  async prepare(input) {
    const user = await User.find(await resolveUserId(input))
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

const createRoleAction: AiAgentActionImplementation = {
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

const updateRoleAction: AiAgentActionImplementation = {
  permission: 'roles:update',
  async prepare(input) {
    const role = await Role.find(await resolveRoleId(input))
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

const deleteRoleAction: AiAgentActionImplementation = {
  permission: 'roles:delete',
  async prepare(input) {
    const role = await Role.query()
      .where('id', await resolveRoleId(input))
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

const createPermissionAction: AiAgentActionImplementation = {
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

const updatePermissionAction: AiAgentActionImplementation = {
  permission: 'permissions:update',
  async prepare(input) {
    const permission = await Permission.find(await resolvePermissionId(input))
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

const deletePermissionAction: AiAgentActionImplementation = {
  permission: 'permissions:delete',
  async prepare(input) {
    const permission = await Permission.query()
      .where('id', await resolvePermissionId(input))
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

const sendWecomMessageAction: AiAgentActionImplementation = {
  permission: 'wecom-templates:send',
  async prepare(input) {
    const templateId = integer(input, 'templateId', ['id'])
    const template = await WecomMessageTemplate.find(templateId)
    if (!template) throw new Error('消息模板不存在')
    if (!template.enabled) throw new Error('消息模板已停用')

    const params = record(input, 'params')
    const mentionedList = stringList(input, 'mentionedList')
    const mentionedMobileList = stringList(input, 'mentionedMobileList')
    validateTemplateParameters(template.payload, template.parameters ?? [], params)
    const rendered = renderWecomPayload(template.payload, params) as Record<string, unknown>
    const payload = applyWecomRuntimeMentions(template.msgtype, rendered, {
      mentionedList,
      mentionedMobileList,
    })
    validateWecomTemplatePayload(template.msgtype, payload)

    return {
      targetType: 'wecom_message_template',
      targetId: String(template.id),
      targetSummary: {
        name: template.name,
        msgtype: template.msgtype,
        parameterNames: Object.keys(params),
        mentionedCount: mentionedList?.length ?? 0,
        mentionedMobileCount: mentionedMobileList?.length ?? 0,
      },
      payload: {
        templateId: template.id,
        parameterNames: Object.keys(params),
        encryptedInput: encryption.encrypt(
          JSON.stringify({ params, mentionedList, mentionedMobileList })
        ),
      },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'wecom-templates:send')
    const template = await WecomMessageTemplate.find(integer(confirmation.payload, 'templateId'))
    if (!template || !template.enabled) throw new Error('消息模板不存在或已停用')
    const encryptedInput = string(confirmation.payload, 'encryptedInput', 100_000)
    let input: {
      params: Record<string, unknown>
      mentionedList?: string[]
      mentionedMobileList?: string[]
    }
    try {
      const decrypted = encryption.decrypt<string>(encryptedInput)
      if (!decrypted) throw new Error('empty encrypted input')
      input = JSON.parse(decrypted)
    } catch {
      throw new Error('消息参数已失效，请重新发起发送')
    }
    await sendWecomMessageTemplate(template, input.params, {
      mentionedList: input.mentionedList,
      mentionedMobileList: input.mentionedMobileList,
    })
    await recordAuditEvent(ctx, {
      actorUserId: actor.id,
      action: 'agent.wecom_message_sent',
      targetType: 'wecom_message_template',
      targetId: template.id,
      metadata: {
        name: template.name,
        msgtype: template.msgtype,
        parameterNames: Object.keys(input.params),
        mentionedCount: input.mentionedList?.length ?? 0,
        mentionedMobileCount: input.mentionedMobileList?.length ?? 0,
        source: 'ai_agent',
      },
    })
    return { sent: true, templateId: template.id }
  },
}

function defineAction(
  name: AiAgentActionName,
  definition: AiAgentActionImplementation
): AiAgentActionDefinition {
  return {
    ...definition,
    impact: destructiveActionNames.has(name) ? 'destructive' : 'standard',
  }
}

const aiAgentActions: Record<AiAgentActionName, AiAgentActionDefinition> = {
  revoke_api_key: defineAction('revoke_api_key', revokeApiKeyAction),
  delete_api_key: defineAction('delete_api_key', deleteApiKeyAction),
  create_api_key: defineAction('create_api_key', createApiKeyAction),
  reset_user_password: defineAction('reset_user_password', resetUserPasswordAction),
  disable_user: defineAction('disable_user', userEnabledAction(true)),
  enable_user: defineAction('enable_user', userEnabledAction(false)),
  update_user: defineAction('update_user', updateUserAction),
  delete_user: defineAction('delete_user', deleteUserAction),
  create_role: defineAction('create_role', createRoleAction),
  update_role: defineAction('update_role', updateRoleAction),
  delete_role: defineAction('delete_role', deleteRoleAction),
  create_permission: defineAction('create_permission', createPermissionAction),
  update_permission: defineAction('update_permission', updatePermissionAction),
  delete_permission: defineAction('delete_permission', deletePermissionAction),
  send_wecom_message: defineAction('send_wecom_message', sendWecomMessageAction),
}

export function getAiAgentAction(action: string) {
  return aiAgentActions[action as AiAgentActionName] ?? null
}

function summaryValue(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  if (Array.isArray(value)) return value.join(', ')
  if (value === null || value === undefined || value === '') return 'not_set'
  return String(value)
}

/** Returns a non-sensitive, user-reviewable preview rather than the action payload. */
export function getAiAgentActionChangeSummary(action: string, payload: Record<string, unknown>) {
  switch (action as AiAgentActionName) {
    case 'revoke_api_key':
      return [{ field: 'result', value: 'revoked' }]
    case 'delete_api_key':
      return [{ field: 'result', value: 'permanently_deleted' }]
    case 'create_api_key':
      return [
        { field: 'name', value: summaryValue(payload, 'name') },
        { field: 'expiry', value: summaryValue(payload, 'expiresIn') },
      ]
    case 'reset_user_password':
      return [{ field: 'result', value: 'new_temporary_password' }]
    case 'disable_user':
      return [{ field: 'account_status', value: 'disabled' }]
    case 'enable_user':
      return [{ field: 'account_status', value: 'enabled' }]
    case 'update_user':
      return [
        { field: 'full_name', value: summaryValue(payload, 'fullName') },
        { field: 'email', value: summaryValue(payload, 'email') },
        { field: 'role_ids', value: summaryValue(payload, 'roleIds') },
      ]
    case 'delete_user':
      return [{ field: 'result', value: 'permanently_deleted' }]
    case 'create_role':
      return [
        { field: 'code', value: summaryValue(payload, 'code') },
        { field: 'name', value: summaryValue(payload, 'name') },
        { field: 'permission_ids', value: summaryValue(payload, 'permissionIds') },
      ]
    case 'update_role':
      return [
        { field: 'name', value: summaryValue(payload, 'name') },
        { field: 'description', value: summaryValue(payload, 'description') },
        { field: 'permission_ids', value: summaryValue(payload, 'permissionIds') },
      ]
    case 'delete_role':
      return [{ field: 'result', value: 'permanently_deleted' }]
    case 'create_permission':
      return [
        { field: 'code', value: summaryValue(payload, 'code') },
        { field: 'name', value: summaryValue(payload, 'name') },
        { field: 'group', value: summaryValue(payload, 'groupName') },
      ]
    case 'update_permission':
      return [
        { field: 'name', value: summaryValue(payload, 'name') },
        { field: 'group', value: summaryValue(payload, 'groupName') },
        { field: 'description', value: summaryValue(payload, 'description') },
      ]
    case 'delete_permission':
      return [{ field: 'result', value: 'permanently_deleted' }]
    case 'send_wecom_message':
      return [
        { field: 'result', value: 'send_wecom_message' },
        { field: 'parameter_names', value: summaryValue(payload, 'parameterNames') },
      ]
  }

  return []
}
