<script setup lang="ts">
import { Eye, RefreshCw } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { toast } from 'vue-sonner'

import DataTable from '@/components/common/DataTable.vue'
import DataTableFacetFilter from '@/components/common/DataTableFacetFilter.vue'
import ListPage from '@/components/common/ListPage.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useRemoteListSearch } from '@/composables/useRemoteListSearch'
import { type AuditLogEntry, listAuditLogs } from '@/features/access-control/api'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { t, te } = useI18n()
const loading = ref(false)
const page = ref(1)
const entries = ref<AuditLogEntry[]>([])
const pageCount = ref(1)
const sourceFilter = ref<string[]>([])
const outcomeFilter = ref<string[]>([])
const actorTypeFilter = ref<string[]>([])
const selectedEntry = ref<AuditLogEntry | null>(null)
const detailsOpen = computed({
  get: () => selectedEntry.value !== null,
  set: (open: boolean) => {
    if (!open) selectedEntry.value = null
  },
})
const metadataJson = computed(() => {
  const details = Object.fromEntries(
    Object.entries(selectedEntry.value?.metadata ?? {}).filter(
      ([key]) => !['actorType', 'source', 'outcome', 'reason'].includes(key)
    )
  )
  return JSON.stringify(details, null, 2)
})
const filterCount = computed(
  () => sourceFilter.value.length + outcomeFilter.value.length + actorTypeFilter.value.length
)
const sourceFilterOptions = computed(() =>
  [
    'http',
    'api_key',
    'ai_agent',
    'wecom',
    'feishu',
    'dingtalk',
    'channel',
    'test',
    'system',
    'legacy',
  ].map((value) => ({ value, label: sourceLabel(value) }))
)
const outcomeFilterOptions = computed(() =>
  ['success', 'denied', 'failure', 'attempted', 'expired', 'cancelled', 'unknown'].map((value) => ({
    value,
    label: outcomeLabel(value),
  }))
)
const actorTypeFilterOptions = computed(() =>
  ['user', 'api_key', 'system', 'anonymous', 'unknown'].map((value) => ({
    value,
    label: actorTypeLabel(value),
  }))
)

function outcomeVariant(outcome: string): 'secondary' | 'destructive' | 'outline' {
  if (outcome === 'success') return 'secondary'
  if (outcome === 'failure' || outcome === 'denied') return 'destructive'
  return 'outline'
}

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
      row.original.actorType === 'api_key'
        ? actorTypeLabel(row.original.actorType)
        : row.original.actor
          ? h('div', [
              h(
                'p',
                { class: 'font-medium' },
                row.original.actor.fullName || row.original.actor.email
              ),
              h('p', { class: 'text-xs text-muted-foreground' }, row.original.actor.email),
            ])
          : actorTypeLabel(row.original.actorType),
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
    accessorKey: 'outcome',
    meta: { label: t('audit_logs.outcome') },
    header: () => t('audit_logs.outcome'),
    cell: ({ row }) =>
      h(Badge, { variant: outcomeVariant(row.original.outcome) }, () =>
        outcomeLabel(row.original.outcome)
      ),
  },
  {
    accessorKey: 'source',
    meta: { label: t('audit_logs.origin') },
    header: () => t('audit_logs.origin'),
    cell: ({ row }) => sourceLabel(row.original.source),
  },
  {
    accessorKey: 'ipAddress',
    meta: { label: t('audit_logs.source_ip') },
    header: () => t('audit_logs.source_ip'),
    cell: ({ row }) => row.original.ipAddress || '-',
  },
  {
    id: 'details',
    meta: { label: t('audit_logs.details') },
    header: () => t('audit_logs.details'),
    cell: ({ row }) =>
      h(
        Button,
        {
          variant: 'ghost',
          size: 'icon',
          title: t('audit_logs.view_details'),
          'aria-label': t('audit_logs.view_details'),
          onClick: () => (selectedEntry.value = row.original),
        },
        () => h(Eye, { class: 'size-4' })
      ),
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

function outcomeLabel(outcome: string) {
  const key = `audit_logs.outcomes.${outcome}`
  return te(key) ? t(key) : outcome
}

function sourceLabel(source: string) {
  const key = `audit_logs.sources.${source}`
  return te(key) ? t(key) : source
}

function actorTypeLabel(actorType: string) {
  const key = `audit_logs.actor_types.${actorType}`
  return te(key) ? t(key) : actorType
}

function reasonLabel(reasonCode: string | null) {
  if (!reasonCode) return '-'
  const key = `audit_logs.reasons.${reasonCode}`
  return te(key) ? t(key) : reasonCode
}

function getAuditSearchableText(entry: AuditLogEntry) {
  return [
    entry.action,
    entry.targetType,
    entry.targetId,
    entry.ipAddress,
    entry.requestId,
    entry.traceId,
    entry.requestRoute,
    entry.reasonCode,
    entry.source,
    entry.outcome,
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
    const result = await listAuditLogs(auth.token, nextPage, search, {
      source: sourceFilter.value,
      outcome: outcomeFilter.value,
      actorType: actorTypeFilter.value,
    })
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

watch([sourceFilter, outcomeFilter, actorTypeFilter], () => void runLoad(1), { deep: true })
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
    <template #refresh-icon>
      <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
    </template>
    <DataTable
      v-model:search="search"
      :columns="columns"
      :data="entries"
      search-mode="remote"
      :get-searchable-text="getAuditSearchableText"
      :search-placeholder="t('audit_logs.search')"
      filters-layout="inline"
      :compact-filter-count="filterCount"
      storage-key="audit-logs-table"
      :empty-message="loading ? t('common.loading') : t('common.no_data')"
      :server-pagination="{ page, pageCount }"
      @page-change="page = $event"
    >
      <template #filters>
        <DataTableFacetFilter
          v-model="outcomeFilter"
          :label="t('audit_logs.outcome')"
          :options="outcomeFilterOptions"
        />
        <DataTableFacetFilter
          v-model="sourceFilter"
          :label="t('audit_logs.origin')"
          :options="sourceFilterOptions"
        />
        <DataTableFacetFilter
          v-model="actorTypeFilter"
          :label="t('audit_logs.actor_type')"
          :options="actorTypeFilterOptions"
        />
      </template>
      <template #compact-filters>
        <DataTableFacetFilter
          v-model="outcomeFilter"
          :label="t('audit_logs.outcome')"
          :options="outcomeFilterOptions"
          compact
        />
        <DataTableFacetFilter
          v-model="sourceFilter"
          :label="t('audit_logs.origin')"
          :options="sourceFilterOptions"
          compact
        />
        <DataTableFacetFilter
          v-model="actorTypeFilter"
          :label="t('audit_logs.actor_type')"
          :options="actorTypeFilterOptions"
          compact
        />
      </template>
    </DataTable>
    <template #dialogs>
      <Dialog v-model:open="detailsOpen">
        <DialogContent class="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{{ t('audit_logs.details') }}</DialogTitle>
            <DialogDescription v-if="selectedEntry">
              {{ actionLabel(selectedEntry.action) }} ·
              {{ targetTypeLabel(selectedEntry.targetType) }}
              {{ selectedEntry.targetId ? `#${selectedEntry.targetId}` : '' }}
            </DialogDescription>
          </DialogHeader>
          <dl v-if="selectedEntry" class="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-muted-foreground">{{ t('audit_logs.outcome') }}</dt>
              <dd>{{ outcomeLabel(selectedEntry.outcome) }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">{{ t('audit_logs.origin') }}</dt>
              <dd>
                {{ sourceLabel(selectedEntry.source) }} ·
                {{ actorTypeLabel(selectedEntry.actorType) }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">{{ t('audit_logs.request') }}</dt>
              <dd>
                {{ selectedEntry.requestMethod || '-' }} {{ selectedEntry.requestRoute || '-' }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">{{ t('audit_logs.reason') }}</dt>
              <dd>{{ reasonLabel(selectedEntry.reasonCode) }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">{{ t('audit_logs.request_id') }}</dt>
              <dd class="break-all">{{ selectedEntry.requestId || '-' }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">{{ t('audit_logs.trace_id') }}</dt>
              <dd class="break-all">{{ selectedEntry.traceId || '-' }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">{{ t('audit_logs.source_ip') }}</dt>
              <dd>{{ selectedEntry.ipAddress || '-' }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">{{ t('audit_logs.user_agent') }}</dt>
              <dd class="break-words">{{ selectedEntry.userAgent || '-' }}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-muted-foreground">{{ t('audit_logs.metadata') }}</dt>
              <dd>
                <pre
                  class="mt-1 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs break-words whitespace-pre-wrap"
                  >{{ metadataJson }}</pre
                >
              </dd>
            </div>
          </dl>
        </DialogContent>
      </Dialog>
    </template>
  </ListPage>
</template>
