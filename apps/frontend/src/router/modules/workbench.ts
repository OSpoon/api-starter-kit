import {
  BookOpen,
  BrainCircuit,
  ChartNoAxesCombined,
  FileClock,
  Gauge,
  Key,
  ListTodo,
  MessageSquare,
  Route,
  Server,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from '@lucide/vue'
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
        name: 'workbench-root',
        redirect: { name: 'dashboard' },
      },
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: {
          title: 'sidebar.dashboard',
          pageKind: 'dashboard',
          permission: 'dashboard:view',
          nav: {
            group: 'sidebar.workbench',
            groupOrder: 10,
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
          pageKind: 'list',
          permission: 'api-keys:read',
          nav: {
            group: 'sidebar.system_management',
            groupOrder: 32,
            icon: Key,
            order: 10,
          },
        },
      },
      {
        path: 'system/status',
        name: 'system-status',
        component: () => import('@/features/system-status/SystemStatusPage.vue'),
        meta: {
          title: 'sidebar.system_status',
          pageKind: 'dashboard',
          permission: 'system-status:read',
          nav: { group: 'sidebar.system_management', groupOrder: 32, icon: Server, order: 10 },
        },
      },
      {
        path: 'system/llm-config',
        name: 'llm-config',
        component: () => import('@/features/llm-config/LlmConfigurationPage.vue'),
        meta: {
          title: 'sidebar.llm_config',
          pageKind: 'settings',
          permission: 'llm-config:read',
          nav: { group: 'sidebar.ai_management', groupOrder: 31, icon: BrainCircuit, order: 10 },
        },
      },
      {
        path: 'system/im-config',
        name: 'im-config',
        component: () => import('@/features/llm-config/ImConfigurationPage.vue'),
        meta: {
          title: 'sidebar.im_config',
          pageKind: 'settings',
          permission: 'im-config:read',
          nav: { group: 'sidebar.ai_management', groupOrder: 31, icon: MessageSquare, order: 20 },
        },
      },
      {
        path: 'system/users',
        name: 'users',
        component: () => import('@/views/AccessControlView.vue'),
        props: { mode: 'users' },
        meta: {
          title: 'sidebar.users',
          pageKind: 'list',
          permission: 'users:read',
          nav: {
            group: 'sidebar.permission_management',
            groupOrder: 30,
            icon: UsersRound,
            order: 10,
          },
        },
      },
      {
        path: 'system/roles',
        name: 'roles',
        component: () => import('@/views/AccessControlView.vue'),
        props: { mode: 'roles' },
        meta: {
          title: 'sidebar.roles',
          pageKind: 'list',
          permission: 'roles:read',
          nav: {
            group: 'sidebar.permission_management',
            groupOrder: 30,
            icon: ShieldCheck,
            order: 20,
          },
        },
      },
      {
        path: 'system/permissions',
        name: 'permissions',
        component: () => import('@/views/AccessControlView.vue'),
        props: { mode: 'permissions' },
        meta: {
          title: 'sidebar.permissions',
          pageKind: 'list',
          permission: 'permissions:read',
          nav: { group: 'sidebar.permission_management', groupOrder: 30, icon: Key, order: 30 },
        },
      },
      {
        path: 'system/audit-logs',
        name: 'audit-logs',
        component: () => import('@/views/AuditLogsView.vue'),
        meta: {
          title: 'sidebar.audit_logs',
          pageKind: 'list',
          permission: 'audit-logs:read',
          nav: { group: 'sidebar.system_management', groupOrder: 32, icon: FileClock, order: 40 },
        },
      },
      {
        path: 'system/knowledge-documents',
        name: 'knowledge-documents',
        component: () => import('@/features/knowledge/KnowledgeDocumentsPage.vue'),
        meta: {
          title: 'sidebar.knowledge_documents',
          pageKind: 'list',
          permission: 'knowledge:manage',
          nav: { group: 'sidebar.ai_management', groupOrder: 31, icon: BookOpen, order: 30 },
        },
      },
      {
        path: 'system/wecom-message-templates',
        name: 'wecom-message-templates',
        component: () => import('@/features/wecom-message-templates/WecomMessageTemplatesPage.vue'),
        meta: {
          title: 'sidebar.wecom_message_templates',
          pageKind: 'list',
          permission: 'wecom-templates:read',
          nav: {
            group: 'sidebar.system_management',
            groupOrder: 32,
            icon: MessageSquare,
            order: 30,
          },
        },
      },
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
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/ProfileView.vue'),
        meta: { title: 'sidebar.profile', pageKind: 'settings' },
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
    ],
  },
]

export const workbenchPermissionRoutes =
  workbenchRoutes.at(0)?.children?.filter((route) => route.meta?.permission) ?? []
