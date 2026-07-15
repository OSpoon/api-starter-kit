import { Bouncer } from '@adonisjs/bouncer'
import { tool } from 'langchain'
import { z } from 'zod'

import { access } from '#abilities/main'
import AuditLog from '#models/audit_log'
import User from '#models/user'
import { buildMyAccessDiagnosis } from '#services/ai_access_diagnostic'
import { getAiAgentAction } from '#services/ai_agent_action_registry'
import { proposeAiAgentAction } from '#services/ai_agent_confirmation'
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
    description: 'Explain the current authenticated user’s own effective access.',
    requiresConfirmation: false,
  },
  {
    name: 'list_api_keys',
    description: 'List non-secret API Key metadata for an authorized administrator.',
    permission: 'api-keys:read',
    requiresConfirmation: false,
  },
  {
    name: 'propose_api_key_revocation',
    description: 'Prepare an API Key revocation that requires explicit user confirmation.',
    permission: 'api-keys:delete',
    requiresConfirmation: true,
  },
]

/**
 * This tool deliberately has no target-user argument. The actor identity is
 * supplied by the authenticated request, which prevents cross-user discovery.
 */
async function ensurePermission(userId: number, permission: PermissionCode) {
  const user = await User.findOrFail(userId)
  const bouncer = new Bouncer(() => user, { access })
  if (!(await bouncer.allows('access', permission))) {
    throw new Error('当前账号没有执行此操作的权限')
  }
  return user
}

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
        description:
          'Diagnose only the current authenticated user’s access. Use it when asked whether the user can perform an action or why their own access is denied. Never use it to diagnose another user.',
        schema: z.object({
          permissionCode: z.enum(permissionCodes).optional(),
        }),
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
        description:
          'List up to 50 active API Keys, including only ID, name, prefix, expiry, and last use. Never return the secret key value.',
        schema: z.object({}),
      }
    ),
    tool(
      async ({ apiKeyId }) => {
        const action = getAiAgentAction('revoke_api_key')!
        await ensurePermission(input.userId, action.permission)
        const confirmation = await proposeAiAgentAction({
          action: 'revoke_api_key',
          actionInput: { apiKeyId },
          conversationId: input.conversationId,
          userId: input.userId,
          agentRunId: input.agentRunId,
        })
        return JSON.stringify({ kind: 'confirmation', confirmation })
      },
      {
        name: 'propose_api_key_revocation',
        description:
          'Prepare, but never execute, revocation of an API Key. Use only after the user clearly identifies a key and explicitly asks to revoke it. The returned confirmation must be approved in the product UI before the key is revoked.',
        schema: z.object({ apiKeyId: z.number().int().positive() }),
      }
    ),
  ]
}
