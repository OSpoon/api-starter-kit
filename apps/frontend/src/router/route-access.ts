import type { RouteRecordName } from 'vue-router'

import { hasPermission, type PermissionRequirement } from '@/lib/permission'

type PermissionRoute = {
  name?: RouteRecordName
  meta?: { permission?: PermissionRequirement }
}

export function findFirstAccessibleRoute<T extends PermissionRoute>(
  routes: T[],
  permissions: string[]
) {
  return routes.find(
    (route) =>
      route.name && route.meta?.permission && hasPermission(permissions, route.meta.permission)
  )
}
