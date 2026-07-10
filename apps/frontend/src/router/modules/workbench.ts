import { ChartNoAxesCombined, Gauge, Key, ListTodo, PanelsTopLeft, Route } from '@lucide/vue'
import type { RouteRecordRaw } from 'vue-router'

export const workbenchRoutes: RouteRecordRaw[] = [
  {
    path: '/',
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
        path: 'page-templates',
        name: 'page-templates',
        component: () => import('@/views/PageTemplatesView.vue'),
        meta: {
          title: 'sidebar.page_templates',
          nav: {
            group: 'sidebar.workbench',
            icon: PanelsTopLeft,
            order: 20,
          },
        },
      },
      {
        path: 'workflow-template',
        name: 'workflow-template',
        component: () => import('@/views/WorkflowTemplateView.vue'),
        meta: { title: 'sidebar.workflow_template', nav: { group: 'sidebar.templates', icon: ListTodo, order: 10 } },
      },
      {
        path: 'analytics-template',
        name: 'analytics-template',
        component: () => import('@/views/AnalyticsTemplateView.vue'),
        meta: { title: 'sidebar.analytics_template', nav: { group: 'sidebar.templates', icon: ChartNoAxesCombined, order: 20 } },
      },
      {
        path: 'wizard-template',
        name: 'wizard-template',
        component: () => import('@/views/WizardTemplateView.vue'),
        meta: { title: 'sidebar.wizard_template', nav: { group: 'sidebar.templates', icon: Route, order: 30 } },
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
