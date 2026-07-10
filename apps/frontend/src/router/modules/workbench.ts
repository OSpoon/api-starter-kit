import { Gauge, Key } from '@lucide/vue'
import type { RouteRecordRaw } from 'vue-router'

export const workbenchRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/WorkbenchLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: { name: 'dashboard' },
      },
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: {
          title: 'sidebar.dashboard',
          nav: {
            group: 'sidebar.workbench',
            icon: Gauge,
            order: 10,
          },
        },
      },
      {
        path: 'api-keys',
        name: 'api-keys',
        component: () => import('@/views/ApiKeysView.vue'),
        meta: {
          title: 'sidebar.api_keys',
          nav: {
            group: 'sidebar.system',
            icon: Key,
            order: 10,
          },
        },
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/ProfileView.vue'),
        meta: { title: 'sidebar.profile' },
      },
      {
        path: 'schema-builder',
        name: 'schema-builder',
        component: () => import('@/views/SchemaBuilderDemo.vue'),
        meta: { title: 'sidebar.schema_builder' },
      },
    ],
  },
]
