import { ChartNoAxesCombined, FileClock, Gauge, Key, ListTodo, PanelsTopLeft, Route, ShieldCheck, Sparkles, UsersRound } from '@lucide/vue'
import type { RouteRecordRaw } from 'vue-router'

export const workbenchRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'workbench',
    component: () => import('@/layouts/AppLayout.vue'),
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
          permission: 'dashboard:view',
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
          permission: 'api-keys:read',
          nav: {
            group: 'sidebar.system',
            icon: Key,
            order: 10,
          },
        },
      },
      {
        path: 'system/users',
        name: 'users',
        component: () => import('@/views/AccessControlView.vue'),
        props: { mode: 'users' },
        meta: {
          title: 'sidebar.users',
          permission: 'users:read',
          nav: { group: 'sidebar.system', icon: UsersRound, order: 20 },
        },
      },
      {
        path: 'system/roles',
        name: 'roles',
        component: () => import('@/views/AccessControlView.vue'),
        props: { mode: 'roles' },
        meta: {
          title: 'sidebar.roles',
          permission: 'roles:read',
          nav: { group: 'sidebar.system', icon: ShieldCheck, order: 30 },
        },
      },
      {
        path: 'system/permissions',
        name: 'permissions',
        component: () => import('@/views/AccessControlView.vue'),
        props: { mode: 'permissions' },
        meta: {
          title: 'sidebar.permissions',
          permission: 'permissions:read',
          nav: { group: 'sidebar.system', icon: Key, order: 40 },
        },
      },
      {
        path: 'system/audit-logs',
        name: 'audit-logs',
        component: () => import('@/views/AuditLogsView.vue'),
        meta: {
          title: 'sidebar.audit_logs',
          permission: 'audit-logs:read',
          nav: { group: 'sidebar.system', icon: FileClock, order: 50 },
        },
      },
      {
        path: 'page-templates',
        name: 'page-templates',
        component: () => import('@/views/PageTemplatesView.vue'),
        meta: {
          title: 'sidebar.page_templates',
          nav: {
            group: 'sidebar.templates',
            icon: PanelsTopLeft,
            order: 10,
          },
        },
      },
      {
        path: 'workflow-template',
        name: 'workflow-template',
        component: () => import('@/views/WorkflowTemplateView.vue'),
        meta: { title: 'sidebar.workflow_template', nav: { group: 'sidebar.templates', icon: ListTodo, order: 20 } },
      },
      {
        path: 'analytics-template',
        name: 'analytics-template',
        component: () => import('@/views/AnalyticsTemplateView.vue'),
        meta: { title: 'sidebar.analytics_template', nav: { group: 'sidebar.templates', icon: ChartNoAxesCombined, order: 30 } },
      },
      {
        path: 'wizard-template',
        name: 'wizard-template',
        component: () => import('@/views/WizardTemplateView.vue'),
        meta: { title: 'sidebar.wizard_template', nav: { group: 'sidebar.templates', icon: Route, order: 40 } },
      },
      {
        path: 'operations-template',
        name: 'operations-template',
        component: () => import('@/views/OperationsTemplateView.vue'),
        meta: { title: 'sidebar.operations_template', nav: { group: 'sidebar.templates', icon: Sparkles, order: 50 } },
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

export const workbenchPermissionRoutes = workbenchRoutes.at(0)?.children?.filter(
  (route) => route.meta?.permission
) ?? []
