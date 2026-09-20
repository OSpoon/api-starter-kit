<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { toast } from 'vue-sonner'

import DataTable from '@/components/common/DataTable.vue'
import ListPage from '@/components/common/ListPage.vue'
import { Badge } from '@/components/ui/badge'
import { useRemoteListSearch } from '@/composables/useRemoteListSearch'
import { type AuditLogEntry, listAuditLogs } from '@/features/access-control/api'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { t, te } = useI18n()
const loading = ref(false)
const page = ref(1)
const entries = ref<AuditLogEntry[]>([])
const pageCount = ref(1)

const columns = computed<ColumnDef<AuditLogEntry>[]>(() => [
  {
    accessorKey: 'createdAt',
    meta: { label: t('audit_logs.time') },
    header: () => t('audit_logs.time'),
    cell: ({ row }) =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date(row.original.createdAt)),
  },
  {
    id: 'actor',
    meta: { label: t('audit_logs.actor') },
    header: () => t('audit_logs.actor'),
    cell: ({ row }) =>
      row.original.actor
        ? h('div', [
            h(
              'p',
              { class: 'font-medium' },
              row.original.actor.fullName || row.original.actor.email
            ),
            h('p', { class: 'text-xs text-muted-foreground' }, row.original.actor.email),
          ])
        : t('audit_logs.system'),
  },
  {
    accessorKey: 'action',
    meta: { label: t('audit_logs.action') },
    header: () => t('audit_logs.action'),
    cell: ({ row }) => h(Badge, { variant: 'secondary' }, () => actionLabel(row.original.action)),
  },
  {
    id: 'target',
    meta: { label: t('audit_logs.target') },
    header: () => t('audit_logs.target'),
    cell: ({ row }) =>
      `${targetTypeLabel(row.original.targetType)}${row.original.targetId ? ` #${row.original.targetId}` : ''}`,
  },
  {
    accessorKey: 'ipAddress',
    meta: { label: t('audit_logs.source') },
    header: () => t('audit_logs.source'),
    cell: ({ row }) => row.original.ipAddress || '-',
  },
])

function actionLabel(action: string) {
  const key = `audit_logs.actions.${action}`
  return te(key) ? t(key) : action
}

function targetTypeLabel(targetType: string) {
  const key = `audit_logs.targets.${targetType}`
  return te(key) ? t(key) : targetType
}

function getAuditSearchableText(entry: AuditLogEntry) {
  return [
    entry.action,
    entry.targetType,
    entry.targetId,
    entry.ipAddress,
    entry.requestId,
    entry.actor?.fullName,
    entry.actor?.email,
  ]
    .filter(Boolean)
    .join(' ')
}

async function load(
  nextPage = page.value,
  search = debouncedSearch.value,
  isCurrent: () => boolean = () => true
) {
  loading.value = true
  try {
    const result = await listAuditLogs(auth.token, nextPage, search)
    if (!isCurrent()) return
    entries.value = result.items
    page.value = result.meta.currentPage
    pageCount.value = result.meta.lastPage
  } catch (error) {
    if (isCurrent()) toast.error(error instanceof Error ? error.message : t('common.error'))
  } finally {
    if (isCurrent()) loading.value = false
  }
}

const { search, debouncedSearch, runLoad } = useRemoteListSearch(page, load)
</script>

<template>
  <ListPage
    :title="t('audit_logs.title')"
    :description="t('audit_logs.desc')"
    :loading="loading"
    :refresh-label="t('common.refresh')"
    action-label=""
    :show-action="false"
    @refresh="runLoad(1)"
  >
    <template #refresh-icon
      ><RefreshCw class="size-4" :class="{ 'animate-spin': loading }"
    /></template>
    <DataTable
      v-model:search="search"
      :columns="columns"
      :data="entries"
      search-mode="remote"
      :get-searchable-text="getAuditSearchableText"
      :search-placeholder="t('audit_logs.search')"
      storage-key="audit-logs-table"
      :empty-message="loading ? t('common.loading') : t('common.no_data')"
      :server-pagination="{ page, pageCount }"
      @page-change="page = $event"
    />
  </ListPage>
</template>
