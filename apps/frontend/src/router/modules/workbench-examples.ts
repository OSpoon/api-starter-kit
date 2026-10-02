import type { RouteRecordRaw } from 'vue-router'

export const developmentWorkbenchRoutes: RouteRecordRaw[] = [
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
