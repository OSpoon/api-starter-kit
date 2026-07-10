import { createRouter, createWebHistory } from 'vue-router'

import { isPasswordExpired } from '@/lib/password'
import { accountRoutes } from '@/router/modules/account'
import { workbenchRoutes } from '@/router/modules/workbench'
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
    },
  ],
})

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

  if (
    auth.isAuthenticated &&
    auth.user &&
    isPasswordExpired(auth.user.passwordChangedAt, auth.user.createdAt) &&
    to.name !== 'change-password'
  ) {
    return { name: 'change-password', query: { reason: 'expired' } }
  }

  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }
})

export default router
