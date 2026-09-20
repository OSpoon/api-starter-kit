import { createRouter, createWebHistory } from 'vue-router'

import { isPasswordExpired } from '@/lib/password'
import { hasPermission } from '@/lib/permission'
import { accountRoutes } from '@/router/modules/account'
import { workbenchPermissionRoutes, workbenchRoutes } from '@/router/modules/workbench'
import { findFirstAccessibleRoute } from '@/router/route-access'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    ...workbenchRoutes,
    ...accountRoutes,
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: 'not_found.title', pageKind: 'auth' },
    },
  ],
})

let synchronizedPermissionSignature: string | null = null

function synchronizePermissionRoutes(permissions: string[], userId: number) {
  const signature = `${userId}:${[...permissions].sort().join('|')}`
  if (synchronizedPermissionSignature === signature) {
    return
  }

  for (const route of workbenchPermissionRoutes) {
    const name = route.name
    if (!name || name === 'dashboard') {
      continue
    }
    const allowed = hasPermission(permissions, route.meta?.permission)
    if (!allowed && router.hasRoute(name)) {
      router.removeRoute(name)
    }
    if (allowed && !router.hasRoute(name)) {
      router.addRoute('workbench', route)
    }
  }
  synchronizedPermissionSignature = signature
}

function getLandingLocation(permissions: string[]) {
  const route = findFirstAccessibleRoute(workbenchPermissionRoutes, permissions)
  return route?.name ? { name: route.name } : { name: 'profile' as const }
}

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (auth.isAuthenticated && !auth.user) {
    await auth.fetchProfile().catch(() => auth.clearSession())
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (auth.user) {
    const routePermission = to.meta.permission
    if (routePermission && !hasPermission(auth.user.permissions, routePermission)) {
      if (to.name === 'dashboard') {
        return getLandingLocation(auth.user.permissions)
      }
      return { name: 'profile' }
    }
    synchronizePermissionRoutes(auth.user.permissions, auth.user.id)
  } else {
    synchronizedPermissionSignature = null
  }

  if (
    auth.isAuthenticated &&
    auth.user &&
    isPasswordExpired(auth.user.passwordChangedAt, auth.user.createdAt) &&
    to.name !== 'change-password'
  ) {
    return { name: 'change-password', query: { reason: 'expired' } }
  }

  if (to.meta.guestOnly && auth.isAuthenticated) {
    return getLandingLocation(auth.user?.permissions ?? [])
  }
})

export default router
