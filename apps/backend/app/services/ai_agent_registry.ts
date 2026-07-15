import { tool } from 'langchain'
import { z } from 'zod'

import AuditLog from '#models/audit_log'
import User from '#models/user'
import { buildMyAccessDiagnosis } from '#services/ai_access_diagnostic'
import { permissionCodes } from '#services/permission_catalog'
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
]

/**
 * This tool deliberately has no target-user argument. The actor identity is
 * supplied by the authenticated request, which prevents cross-user discovery.
 */
export function createAiAgentTools(userId: number) {
  return [
    tool(
      async ({ permissionCode }) => {
        const user = await User.findOrFail(userId)
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
  ]
}
