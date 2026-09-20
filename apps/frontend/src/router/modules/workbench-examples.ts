import { ChartNoAxesCombined, ListTodo, Route, Sparkles } from '@lucide/vue'
import type { RouteRecordRaw } from 'vue-router'

export const developmentWorkbenchRoutes: RouteRecordRaw[] = [
  {
    path: 'workflow-template',
    name: 'workflow-template',
    component: () => import('@/views/WorkflowTemplateView.vue'),
    meta: {
      title: 'sidebar.workflow_template',
      pageKind: 'workflow',
      nav: { group: 'sidebar.templates', groupOrder: 20, icon: ListTodo, order: 10 },
    },
  },
  {
    path: 'analytics-template',
    name: 'analytics-template',
    component: () => import('@/views/AnalyticsTemplateView.vue'),
    meta: {
      title: 'sidebar.analytics_template',
      pageKind: 'analytics',
      nav: { group: 'sidebar.templates', groupOrder: 20, icon: ChartNoAxesCombined, order: 20 },
    },
  },
  {
    path: 'wizard-template',
    name: 'wizard-template',
    component: () => import('@/views/WizardTemplateView.vue'),
    meta: {
      title: 'sidebar.wizard_template',
      pageKind: 'wizard',
      nav: { group: 'sidebar.templates', groupOrder: 20, icon: Route, order: 30 },
    },
  },
  {
    path: 'operations-template',
    name: 'operations-template',
    component: () => import('@/views/OperationsTemplateView.vue'),
    meta: {
      title: 'sidebar.operations_template',
      pageKind: 'utility',
      nav: { group: 'sidebar.templates', groupOrder: 20, icon: Sparkles, order: 40 },
    },
  },
  {
    path: 'schema-builder',
    name: 'schema-builder',
    component: () => import('@/views/SchemaBuilderDemo.vue'),
    meta: { title: 'sidebar.schema_builder', pageKind: 'utility' },
  },
  {
    path: 'sql-editor',
    name: 'sql-editor',
    component: () => import('@/views/SqlEditorDemo.vue'),
    meta: { title: 'sidebar.sql_editor', pageKind: 'utility' },
  },
  {
    path: 'sql-workspace',
    name: 'sql-workspace',
    component: () => import('@/views/SqlWorkspaceView.vue'),
    meta: { title: 'sidebar.sql_workspace', pageKind: 'utility' },
  },
]
