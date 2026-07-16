import { Bouncer } from '@adonisjs/bouncer'
import { tool } from 'langchain'
import { z } from 'zod'

import { access } from '#abilities/main'
import AuditLog from '#models/audit_log'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { buildMyAccessDiagnosis } from '#services/ai_access_diagnostic'
import { getAiAgentAction } from '#services/ai_agent_action_registry'
import { AiAgentConfirmationError, proposeAiAgentAction } from '#services/ai_agent_confirmation'
import { type PermissionCode, permissionCodes } from '#services/permission_catalog'
import { loadUserAccess } from '#services/user_access'

export interface AiAgentCapability {
  name: string
  description: string
  permission?: string
  requiresConfirmation: boolean
}

export const aiAgentCapabilities: readonly AiAgentCapability[] = [
  {
    name: 'diagnose_my_access',
    description: 'Explain the current user’s effective access.',
    requiresConfirmation: false,
  },
  {
    name: 'list_api_keys',
    description: 'List non-secret API Key metadata.',
    permission: 'api-keys:read',
    requiresConfirmation: false,
  },
  {
    name: 'list_users',
    description: 'List managed users and their roles.',
    permission: 'users:read',
    requiresConfirmation: false,
  },
  {
    name: 'list_roles',
    description: 'List roles and assigned permissions.',
    permission: 'roles:read',
    requiresConfirmation: false,
  },
  {
    name: 'list_permissions',
    description: 'List the permission catalog.',
    permission: 'permissions:read',
    requiresConfirmation: false,
  },
  {
    name: 'list_audit_logs',
    description: 'List recent audit events.',
    permission: 'audit-logs:read',
    requiresConfirmation: false,
  },
  {
    name: 'propose_system_management_change',
    description:
      'Prepare any supported non-secret system-management change for explicit confirmation.',
    requiresConfirmation: true,
  },
]

async function ensurePermission(userId: number, permission: PermissionCode) {
  const user = await User.findOrFail(userId)
  const bouncer = new Bouncer(() => user, { access })
  if (!(await bouncer.allows('access', permission))) throw new Error('当前账号没有执行此操作的权限')
  return user
}

const changeSchemas = {
  revoke_api_key: z.object({ apiKeyId: z.number().int().positive() }),
  update_user: z.object({
    userId: z.number().int().positive(),
    fullName: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(254),
    roleIds: z.array(z.number().int().positive()),
  }),
  delete_user: z.object({ userId: z.number().int().positive() }),
  create_role: z.object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9-]+$/),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).nullable().optional(),
    permissionIds: z.array(z.number().int().positive()),
  }),
  update_role: z.object({
    roleId: z.number().int().positive(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).nullable().optional(),
    permissionIds: z.array(z.number().int().positive()),
  }),
  delete_role: z.object({ roleId: z.number().int().positive() }),
  create_permission: z.object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9-]+:[a-z0-9-]+$/),
    name: z.string().trim().min(1).max(120),
    groupName: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).nullable().optional(),
  }),
  update_permission: z.object({
    permissionId: z.number().int().positive(),
    name: z.string().trim().min(1).max(120),
    groupName: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).nullable().optional(),
  }),
  delete_permission: z.object({ permissionId: z.number().int().positive() }),
} as const

const changeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('revoke_api_key'), input: changeSchemas.revoke_api_key }),
  z.object({ action: z.literal('update_user'), input: changeSchemas.update_user }),
  z.object({ action: z.literal('delete_user'), input: changeSchemas.delete_user }),
  z.object({ action: z.literal('create_role'), input: changeSchemas.create_role }),
  z.object({ action: z.literal('update_role'), input: changeSchemas.update_role }),
  z.object({ action: z.literal('delete_role'), input: changeSchemas.delete_role }),
  z.object({ action: z.literal('create_permission'), input: changeSchemas.create_permission }),
  z.object({ action: z.literal('update_permission'), input: changeSchemas.update_permission }),
  z.object({ action: z.literal('delete_permission'), input: changeSchemas.delete_permission }),
])

export function createAiAgentTools(input: {
  userId: number
  conversationId: number
  agentRunId: string
}) {
  return [
    tool(
      async ({ permissionCode }) => {
        const user = await User.findOrFail(input.userId)
        await loadUserAccess(user)
        const diagnosis = buildMyAccessDiagnosis(
          user.roles.map((role) => ({
            code: role.code,
            name: role.name,
            permissions: role.permissions.map((permission) => permission.code),
          })),
          permissionCode
        )
        await AuditLog.create({
          actorUserId: user.id,
          action: 'agent.access_diagnosed',
          targetType: 'user',
          targetId: String(user.id),
          metadata: { permissionCode: permissionCode ?? null },
        })
        return JSON.stringify(diagnosis)
      },
      {
        name: 'diagnose_my_access',
        description: 'Diagnose only the current authenticated user’s access.',
        schema: z.object({ permissionCode: z.enum(permissionCodes).optional() }),
      }
    ),
    tool(
      async () => {
        await ensurePermission(input.userId, 'api-keys:read')
        const { default: ApiKey } = await import('#models/api_key')
        const keys = await ApiKey.query()
          .whereNull('revoked_at')
          .orderBy('created_at', 'desc')
          .limit(50)
        return JSON.stringify(
          keys.map((key) => ({
            id: key.id,
            name: key.name,
            prefix: key.prefix,
            expiresAt: key.expiresAt?.toISO() ?? null,
            lastUsedAt: key.lastUsedAt?.toISO() ?? null,
          }))
        )
      },
      {
        name: 'list_api_keys',
        description: 'List up to 50 active API Keys without secret values.',
        schema: z.object({}),
      }
    ),
    tool(
      async ({ limit }) => {
        await ensurePermission(input.userId, 'users:read')
        const users = await User.query().preload('roles').orderBy('id').limit(limit)
        return JSON.stringify(
          users.map((user) => ({
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            twoFactorEnabled: user.twoFactorEnabled,
            roles: user.roles.map((role) => ({ id: role.id, code: role.code, name: role.name })),
          }))
        )
      },
      {
        name: 'list_users',
        description: 'List managed users; use this to identify a user before proposing a change.',
        schema: z.object({ limit: z.number().int().min(1).max(100).default(50) }),
      }
    ),
    tool(
      async () => {
        await ensurePermission(input.userId, 'roles:read')
        const roles = await Role.query()
          .preload('permissions')
          .withCount('users')
          .orderBy('is_system', 'desc')
          .orderBy('name')
        return JSON.stringify(
          roles.map((role) => ({
            id: role.id,
            code: role.code,
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
            userCount: Number(role.$extras.users_count ?? 0),
            permissions: role.permissions.map((permission) => ({
              id: permission.id,
              code: permission.code,
              name: permission.name,
            })),
          }))
        )
      },
      {
        name: 'list_roles',
        description: 'List all roles with permission assignments and user counts.',
        schema: z.object({}),
      }
    ),
    tool(
      async () => {
        await ensurePermission(input.userId, 'permissions:read')
        const permissions = await Permission.query()
          .withCount('roles')
          .orderBy('group_name')
          .orderBy('code')
        return JSON.stringify(
          permissions.map((permission) => ({
            id: permission.id,
            code: permission.code,
            name: permission.name,
            groupName: permission.groupName,
            description: permission.description,
            isSystem: permission.isSystem,
            roleCount: Number(permission.$extras.roles_count ?? 0),
          }))
        )
      },
      {
        name: 'list_permissions',
        description: 'List the permission catalog and reference counts.',
        schema: z.object({}),
      }
    ),
    tool(
      async ({ limit }) => {
        await ensurePermission(input.userId, 'audit-logs:read')
        const logs = await AuditLog.query().preload('actor').orderBy('id', 'desc').limit(limit)
        return JSON.stringify(
          logs.map((log) => ({
            id: log.id,
            action: log.action,
            targetType: log.targetType,
            targetId: log.targetId,
            metadata: log.metadata,
            createdAt: log.createdAt.toISO(),
            actor: log.actor
              ? { id: log.actor.id, fullName: log.actor.fullName, email: log.actor.email }
              : null,
          }))
        )
      },
      {
        name: 'list_audit_logs',
        description: 'List recent audit events without IP addresses or user-agent strings.',
        schema: z.object({ limit: z.number().int().min(1).max(100).default(30) }),
      }
    ),
    tool(
      async ({ action, input: actionInput }) => {
        const definition = getAiAgentAction(action)!
        await ensurePermission(input.userId, definition.permission)
        try {
          const confirmation = await proposeAiAgentAction({
            action,
            actionInput,
            conversationId: input.conversationId,
            userId: input.userId,
            agentRunId: input.agentRunId,
          })
          return JSON.stringify({ kind: 'confirmation', confirmation })
        } catch (error) {
          if (error instanceof AiAgentConfirmationError) {
            return JSON.stringify({ kind: 'action_error', message: error.message })
          }
          throw error
        }
      },
      {
        name: 'propose_system_management_change',
        description:
          'Prepare a requested system-management change only after the user clearly asks for it. Never execute it directly; the structured confirmation card must be approved.',
        schema: changeSchema,
      }
    ),
  ]
}
