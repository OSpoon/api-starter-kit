import type { AiAgentActionImplementation } from '#ai/core/ai_agent_action_contracts'
import {
  defineAiAgentAction,
  getAiAgentActor,
  integer,
  optionalDescription,
  string,
  summaryValue,
} from '#ai/core/ai_agent_action_helpers'
import Role from '#models/role'
import {
  assertGrantablePermissionIds,
  createRoleWithPermissions,
  updateRoleWithPermissions,
} from '#services/access_control_mutations'
import { recordAuditEvent } from '#services/audit_log'

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

const createRoleAction: AiAgentActionImplementation = {
  permission: 'roles:create',
  async prepare(input, actorUserId) {
    const code = string(input, 'code', 100)
    if (!/^[a-z0-9-]+$/.test(code) || code.length < 2) throw new Error('角色代码无效')
    if (await Role.findBy('code', code)) throw new Error('角色代码已存在')
    const ids = permissionIds(input)
    await assertGrantablePermissionIds(actorUserId, ids)
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
    const actor = getAiAgentActor(ctx)
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
  async prepare(input, actorUserId) {
    const role = await Role.find(await resolveRoleId(input))
    if (!role) throw new Error('角色不存在')
    if (role.isSystem) throw new Error('系统内置角色不可编辑')
    const ids = permissionIds(input)
    await assertGrantablePermissionIds(actorUserId, ids)
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
    const actor = getAiAgentActor(ctx)
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
    const actor = getAiAgentActor(ctx)
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
