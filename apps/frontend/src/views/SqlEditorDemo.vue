<script setup lang="ts">
import PageShell from '@/components/common/PageShell.vue'
import type { SqlDialect, SqlTable } from '@/components/common/sql-editor'
import SqlEditor from '@/components/common/SqlEditor.vue'

const { t } = useI18n()
const sqlDialect = ref<SqlDialect>('postgresql')
const demoSchema = [
  {
    name: 'users',
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'email', type: 'varchar' },
      { name: 'created_at', type: 'timestamp' },
    ],
  },
  {
    name: 'role_user',
    columns: [
      { name: 'user_id', type: 'uuid' },
      { name: 'role_id', type: 'uuid' },
    ],
  },
  {
    name: 'roles',
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'slug', type: 'varchar' },
      { name: 'name', type: 'varchar' },
    ],
  },
] satisfies SqlTable[]
const sqlTemplate = ref(`SELECT
  u.email
FROM
  users u
  JOIN role_user ru ON u.id = ru.user_id
  JOIN roles r ON ru.role_id = r.id
WHERE
  r.slug = {{slug}}`)
</script>

<template>
  <PageShell
    :title="t('sql_editor.title')"
    :description="t('sql_editor.description')"
    class="gap-4"
  >
    <div
      class="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
    >
      <p class="font-medium text-foreground">{{ t('sql_editor.schema_demo_title') }}</p>
      <p class="mt-1">{{ t('sql_editor.schema_demo_description') }}</p>
    </div>
    <div class="min-h-0 flex-1">
      <SqlEditor
        v-model="sqlTemplate"
        v-model:db-type="sqlDialect"
        :schema="demoSchema"
        :schema-synced="true"
      />
    </div>
  </PageShell>
</template>
