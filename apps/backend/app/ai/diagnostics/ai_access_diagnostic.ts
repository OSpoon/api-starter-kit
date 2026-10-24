import type { HttpContext } from '@adonisjs/core/http'

import User from '#models/user'
import { recordAuditEvent } from '#services/audit_log'
import { loadUserAccess } from '#services/user_access'

export type AiAccessRole = {
  code: string
  name: string
  permissions: string[]
}

export function buildMyAccessDiagnosis(roles: AiAccessRole[], requestedPermission?: string) {
  const isSuperAdmin = roles.some((role) => role.code === 'super-admin')
  const effectivePermissions = isSuperAdmin
    ? ['*']
    : [...new Set(roles.flatMap((role) => role.permissions))].sort()
  const granted = requestedPermission
    ? isSuperAdmin || effectivePermissions.includes(requestedPermission)
    : undefined

  return {
    roles: roles.map(({ code, name }) => ({ code, name })),
    effectivePermissions,
    requestedPermission: requestedPermission
      ? {
          code: requestedPermission,
          granted,
        }
      : null,
  }
}

export async function diagnoseMyAccess(
  userId: number,
  requestedPermission?: string,
  ctx?: HttpContext
) {
  const user = await User.findOrFail(userId)
  await loadUserAccess(user)
  const diagnosis = buildMyAccessDiagnosis(
    user.roles.map((role) => ({
      code: role.code,
      name: role.name,
      permissions: role.permissions.map((permission) => permission.code),
    })),
    requestedPermission
  )
  await recordAuditEvent(ctx, {
    actorUserId: user.id,
    source: 'ai_agent',
    action: 'agent.access_diagnosed',
    targetType: 'user',
    targetId: user.id,
    metadata: { permissionCode: requestedPermission ?? null },
  })
  return diagnosis
}
