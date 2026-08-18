import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

import type { PermissionCode } from '#authorization/permission_catalog'

export default class PermissionMiddleware {
  async handle(ctx: HttpContext, next: NextFn, permissions: PermissionCode[]) {
    const allowed = await Promise.all(
      permissions.map((permission) => ctx.bouncer.allows('access', permission))
    )

    if (!allowed.some(Boolean)) {
      return ctx.response.forbidden({
        code: 'E_AUTH_UNAUTHORIZED',
        message: 'Insufficient permissions',
      })
    }

    return next()
  }
}
