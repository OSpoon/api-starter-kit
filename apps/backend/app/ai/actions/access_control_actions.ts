import type { AiAgentActionImplementation } from '#ai/core/ai_agent_action_contracts'
import {
  defineAiAgentAction,
  ensurePermission,
  integer,
  optionalDescription,
  string,
  summaryValue,
} from '#ai/core/ai_agent_action_helpers'
import Permission from '#models/permission'
import Role from '#models/role'
import {
  createRoleWithPermissions,
  updateRoleWithPermissions,
} from '#services/access_control_mutations'
import { recordAuditEvent } from '#services/audit_log'
import { permissionCatalogCodes } from '#services/permission_catalog'

async function resolveRoleId(input: Record<string, unknown>) {
  const value = input.roleId
  if (value !== undefined) return integer({ roleId: value }, 'roleId')
  const code = string(input, 'code', 100)
  const role = await Role.findBy('code', code)
  if (!role) throw new Error('角色不存在')
  return role.id
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
  const permissions = await Permission.query()
    .whereIn('id', ids)
    .whereIn('code', permissionCatalogCodes)
  return permissions.length === ids.length
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
    const payload = confirmation.payload
    const code = string(payload, 'code', 100)
    const ids = permissionIds(payload)
    await createRoleWithPermissions({
      ctx,
      actorUserId: actor.id,
      code,
      name: string(payload, 'name', 120),
      description: optionalDescription(payload),
      permissionIds: ids,
      source: 'ai_agent',
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
    const payload = confirmation.payload
    const role = await Role.find(integer(payload, 'roleId'))
    if (!role || role.isSystem) throw new Error('角色不存在或不可编辑')
    const ids = permissionIds(payload)
    await updateRoleWithPermissions({
      ctx,
      actorUserId: actor.id,
      roleId: role.id,
      name: string(payload, 'name', 120),
      description: optionalDescription(payload),
      permissionIds: ids,
      source: 'ai_agent',
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
    ) {
      throw new Error('系统角色、仍被用户使用或仍分配权限的角色不可删除')
    }
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
    ) {
      throw new Error('角色不存在、受保护、仍被用户使用或仍分配权限')
    }
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

export const accessControlActions = {
  create_role: defineAiAgentAction(createRoleAction, {
    impact: 'standard',
    summarize: (payload) => [
      { field: 'code', value: summaryValue(payload, 'code') },
      { field: 'name', value: summaryValue(payload, 'name') },
      { field: 'permission_ids', value: summaryValue(payload, 'permissionIds') },
    ],
  }),
  update_role: defineAiAgentAction(updateRoleAction, {
    impact: 'standard',
    summarize: (payload) => [
      { field: 'name', value: summaryValue(payload, 'name') },
      { field: 'description', value: summaryValue(payload, 'description') },
      { field: 'permission_ids', value: summaryValue(payload, 'permissionIds') },
    ],
  }),
  delete_role: defineAiAgentAction(deleteRoleAction, {
    impact: 'destructive',
    summarize: () => [{ field: 'result', value: 'permanently_deleted' }],
  }),
}
