import type { AiAgentActionImplementation } from '#ai/core/ai_agent_action_contracts'
import {
  defineAiAgentAction,
  getAiAgentActor,
  integer,
  string,
  summaryValue,
} from '#ai/core/ai_agent_action_helpers'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'
import {
  assertGrantableRoleIds,
  createManagedUser,
  deleteManagedUser,
  setManagedUserDisabled,
  updateManagedUser,
} from '#services/access_control_mutations'
import { recordAuditEvent } from '#services/audit_log'
import { isInternalUser } from '#services/channel_guest_principal'
import { isSuperAdmin } from '#services/super_admin_access'

async function resolveUserId(input: Record<string, unknown>) {
  const value = input.userId
  if (value !== undefined) return integer({ userId: value }, 'userId')
  const email = string(input, 'email', 254)
  const user = await User.findBy('email', email)
  if (!user) throw new Error('用户不存在')
  return user.id
}

function userTargetSummary(user: User) {
  return { fullName: user.fullName, email: user.email }
}

async function ensureSuperAdminTargetAccess(actorUserId: number, target: User, message: string) {
  if (await isSuperAdmin(target)) {
    const actor = await User.findOrFail(actorUserId)
    if (!(await isSuperAdmin(actor))) throw new Error(message)
  }
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

const resetUserPasswordAction: AiAgentActionImplementation = {
  permission: 'users:update',
  async prepare(input, actorUserId) {
    const user = await User.find(await resolveUserId(input))
    if (!user) throw new Error('用户不存在')
    if (isInternalUser(user)) throw new Error('系统内部用户不可管理')
    await ensureSuperAdminTargetAccess(actorUserId, user, '仅超级管理员可以重置超级管理员的密码')
    return {
      targetType: 'user',
      targetId: String(user.id),
      targetSummary: userTargetSummary(user),
      payload: { userId: user.id },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = getAiAgentActor(ctx)
    const user = await User.find(integer(confirmation.payload, 'userId'))
    if (!user) throw new Error('用户不存在')
    if (isInternalUser(user)) throw new Error('系统内部用户不可管理')
    if (user.id === actor.id) throw new Error('请通过个人资料页面修改当前账号的密码')
    await ensureSuperAdminTargetAccess(actor.id, user, '仅超级管理员可以重置超级管理员的密码')
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

function userEnabledAction(disabled: boolean) {
  const implementation: AiAgentActionImplementation = {
    permission: 'users:update',
    async prepare(input, actorUserId) {
      const user = await User.find(await resolveUserId(input))
      if (!user) throw new Error('用户不存在')
      if (isInternalUser(user)) throw new Error('系统内部用户不可管理')
      await ensureSuperAdminTargetAccess(actorUserId, user, '仅超级管理员可以维护超级管理员账户')
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
      const actor = getAiAgentActor(ctx)
      const userId = integer(confirmation.payload, 'userId')
      await setManagedUserDisabled({
        ctx,
        actorUserId: actor.id,
        userId,
        disabled,
        source: 'ai_agent',
      })
    },
  }

  return defineAiAgentAction(implementation, {
    impact: disabled ? 'destructive' : 'standard',
    summarize: () => [{ field: 'account_status', value: disabled ? 'disabled' : 'enabled' }],
  })
}

const updateUserAction: AiAgentActionImplementation = {
  permission: 'users:update',
  async prepare(input, actorUserId) {
    const user = await User.find(await resolveUserId(input))
    const nextRoleIds = roleIds(input)
    if (!user) throw new Error('用户不存在')
    if (isInternalUser(user)) throw new Error('系统内部用户不可管理')
    await ensureSuperAdminTargetAccess(actorUserId, user, '仅超级管理员可以维护超级管理员账户')
    await assertGrantableRoleIds(actorUserId, nextRoleIds)
    return {
      targetType: 'user',
      targetId: String(user.id),
      targetSummary: userTargetSummary(user),
      payload: {
        userId: user.id,
        fullName: string(input, 'fullName', 120),
        email: string(input, 'email', 254),
        roleIds: nextRoleIds,
      },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = getAiAgentActor(ctx)
    const payload = confirmation.payload
    const user = await User.find(integer(payload, 'userId'))
    const nextRoleIds = roleIds(payload)
    if (!user) throw new Error('用户不存在')
    if (isInternalUser(user)) throw new Error('系统内部用户不可管理')
    const fullName = string(payload, 'fullName', 120)
    const email = string(payload, 'email', 254)
    const sameEmail = await User.findBy('email', email)
    if (sameEmail && sameEmail.id !== user.id) throw new Error('该邮箱已被使用')
    await updateManagedUser({
      ctx,
      actorUserId: actor.id,
      userId: user.id,
      fullName,
      email,
      roleIds: nextRoleIds,
      source: 'ai_agent',
    })
  },
}

const deleteUserAction: AiAgentActionImplementation = {
  permission: 'users:delete',
  async prepare(input, actorUserId) {
    const user = await User.find(await resolveUserId(input))
    if (!user) throw new Error('用户不存在')
    if (isInternalUser(user)) throw new Error('系统内部用户不可管理')
    await ensureSuperAdminTargetAccess(actorUserId, user, '仅超级管理员可以删除超级管理员账户')
    return {
      targetType: 'user',
      targetId: String(user.id),
      targetSummary: userTargetSummary(user),
      payload: { userId: user.id },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = getAiAgentActor(ctx)
    const user = await User.find(integer(confirmation.payload, 'userId'))
    if (!user) throw new Error('用户不存在')
    if (isInternalUser(user)) throw new Error('系统内部用户不可管理')
    if (user.id === actor.id) throw new Error('不能删除当前登录账号')
    await deleteManagedUser({
      ctx,
      actorUserId: actor.id,
      userId: user.id,
      source: 'ai_agent',
    })
  },
}

const createUserAction: AiAgentActionImplementation = {
  permission: 'users:create',
  async prepare(input, actorUserId) {
    const fullName = string(input, 'fullName', 120)
    const email = string(input, 'email', 254).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('email 无效')
    if (await User.findBy('email', email)) throw new Error('该邮箱已被使用')
    const ids = roleIds(input)
    await assertGrantableRoleIds(actorUserId, ids)
    return {
      targetType: 'user',
      targetId: email,
      targetSummary: { fullName, email },
      payload: { fullName, email, roleIds: ids },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = getAiAgentActor(ctx)
    const fullName = string(confirmation.payload, 'fullName', 120)
    const email = string(confirmation.payload, 'email', 254).toLowerCase()
    if (await User.findBy('email', email)) throw new Error('该邮箱已被使用')
    const password = generateInitialPassword()
    const user = await createManagedUser({
      ctx,
      actorUserId: actor.id,
      fullName,
      email,
      password,
      roleIds: roleIds(confirmation.payload),
      source: 'ai_agent',
    })
    return {
      userId: user.id,
      credential: { kind: 'password', value: password, label: user.email },
    }
  },
}

export const userActions = {
  reset_user_password: defineAiAgentAction(resetUserPasswordAction, {
    impact: 'destructive',
    summarize: () => [{ field: 'result', value: 'new_temporary_password' }],
  }),
  disable_user: userEnabledAction(true),
  enable_user: userEnabledAction(false),
  update_user: defineAiAgentAction(updateUserAction, {
    impact: 'standard',
    summarize: (payload) => [
      { field: 'full_name', value: summaryValue(payload, 'fullName') },
      { field: 'email', value: summaryValue(payload, 'email') },
      { field: 'role_ids', value: summaryValue(payload, 'roleIds') },
    ],
  }),
  delete_user: defineAiAgentAction(deleteUserAction, {
    impact: 'destructive',
    summarize: () => [{ field: 'result', value: 'permanently_deleted' }],
  }),
  create_user: defineAiAgentAction(createUserAction, {
    impact: 'standard',
    summarize: (payload) => [
      { field: 'full_name', value: summaryValue(payload, 'fullName') },
      { field: 'email', value: summaryValue(payload, 'email') },
      { field: 'role_ids', value: summaryValue(payload, 'roleIds') },
    ],
  }),
}
