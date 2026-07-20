import { Bouncer } from '@adonisjs/bouncer'
import { tool } from 'langchain'
import { z } from 'zod'

import { access } from '#abilities/main'
import AuditLog from '#models/audit_log'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { buildMyAccessDiagnosis } from '#services/ai_access_diagnostic'
import {
  aiAgentChangeSchema,
  getAiAgentAction,
  getAiAgentActionCapabilities,
} from '#services/ai_agent_action_registry'
import { AiAgentConfirmationError, proposeAiAgentAction } from '#services/ai_agent_confirmation'
import { type PermissionCode, permissionCodes } from '#services/permission_catalog'
import { loadUserAccess } from '#services/user_access'

export interface AiAgentCapability {
  name: string
  description: string
  permission?: string
  requiresConfirmation: boolean
}

const readAgentCapabilities: readonly AiAgentCapability[] = [
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
]

export const aiAgentCapabilities: readonly AiAgentCapability[] = [
  ...readAgentCapabilities,
  ...getAiAgentActionCapabilities(),
]

async function ensurePermission(userId: number, permission: PermissionCode) {
  const user = await User.findOrFail(userId)
  const bouncer = new Bouncer(() => user, { access })
  if (!(await bouncer.allows('access', permission))) throw new Error('当前账号没有执行此操作的权限')
  return user
}

export function createAiAgentTools(input: {
  userId: number
  conversationId: number
  agentRunId: string
  signal?: AbortSignal
}) {
  const throwIfAborted = () => {
    if (input.signal?.aborted) {
      throw new DOMException('AI request was cancelled', 'AbortError')
    }
  }

  return [
    tool(
      async ({ permissionCode }) => {
        throwIfAborted()
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
        throwIfAborted()
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
        throwIfAborted()
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
        throwIfAborted()
        await ensurePermission(input.userId, 'roles:read')
        const roles = await Role.query()
          .preload('permissions', (query) => query.orderBy('code').limit(200))
          .withCount('users')
          .orderBy('is_system', 'desc')
          .orderBy('name')
          .limit(100)
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
        throwIfAborted()
        await ensurePermission(input.userId, 'permissions:read')
        const permissions = await Permission.query()
          .withCount('roles')
          .orderBy('group_name')
          .orderBy('code')
          .limit(200)
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
        throwIfAborted()
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
        try {
          throwIfAborted()
          const definition = getAiAgentAction(action)!
          await ensurePermission(input.userId, definition.permission)
          const confirmation = await proposeAiAgentAction({
            action,
            actionInput,
            conversationId: input.conversationId,
            userId: input.userId,
            agentRunId: input.agentRunId,
          })
          throwIfAborted()
          return JSON.stringify({ kind: 'confirmation', confirmation })
        } catch (error) {
          if (error instanceof AiAgentConfirmationError) {
            return JSON.stringify({ kind: 'action_error', message: error.message })
          }
          return JSON.stringify({
            kind: 'action_error',
            message: error instanceof Error ? error.message : '无法准备受控操作',
          })
        }
      },
      {
        name: 'propose_system_management_change',
        description:
          'Prepare a requested system-management change only after the user clearly asks for it. Never execute it directly; the structured confirmation card must be approved.',
        schema: aiAgentChangeSchema,
      }
    ),
  ]
}
