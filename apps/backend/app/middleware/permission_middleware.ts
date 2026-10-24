import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

import { recordAuditEvent } from '#services/audit_log'

export default class PermissionMiddleware {
  async handle(ctx: HttpContext, next: NextFn, permissions: string[]) {
    const allowed = await Promise.all(
      permissions.map((permission) => ctx.bouncer.allows('access', permission))
    )

    if (!allowed.some(Boolean)) {
      await recordAuditEvent(ctx, {
        actorUserId: ctx.auth?.user?.id ?? null,
        action: 'authorization.permission_denied',
        targetType: 'permission',
        targetId: permissions.join(',').slice(0, 120),
        outcome: 'denied',
        reasonCode: 'permission_denied',
        metadata: { requiredPermissions: permissions },
      })
      return ctx.response.forbidden({
        code: 'E_AUTH_UNAUTHORIZED',
        message: 'Insufficient permissions',
      })
    }

    return next()
  }
}
