import type { RouteRecordRaw } from 'vue-router'

export const workbenchRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/WorkbenchLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: { name: 'api-keys' },
      },
      {
        path: 'api-keys',
        name: 'api-keys',
        component: () => import('@/views/ApiKeysView.vue'),
        meta: { title: 'sidebar.api_keys' },
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/ProfileView.vue'),
        meta: { title: 'sidebar.profile' },
      },
      {
        path: 'docs',
        name: 'docs',
        component: () => import('@/views/DocsView.vue'),
        meta: { title: 'nav.api_docs' },
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
