import { isPasswordExpired } from '@/lib/password'
import { useAuthStore } from '@/stores/auth'

import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: { name: 'dashboard' },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@assistant/views/AssistantView.vue'),
      meta: { requiresAuth: true, title: 'ai_chat.title', pageKind: 'utility' },
    },
    {
      path: '/assistant',
      name: 'assistant',
      component: () => import('@assistant/views/AssistantView.vue'),
      meta: { requiresAuth: true, title: 'ai_chat.title', pageKind: 'utility' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guestOnly: true, title: 'auth.title', pageKind: 'auth' },
    },
    {
      path: '/change-password',
      name: 'change-password',
      component: () => import('@/views/ChangePasswordView.vue'),
      meta: { requiresAuth: true, title: 'change_password.title', pageKind: 'settings' },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { requiresAuth: true, title: 'sidebar.profile', pageKind: 'settings' },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'dashboard' },
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
