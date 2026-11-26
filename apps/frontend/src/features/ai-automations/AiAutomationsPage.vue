<script setup lang="ts">
import { ChevronLeft, ChevronRight, History, MoreHorizontal, Play } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { useIntervalFn } from '@vueuse/core'
import { h } from 'vue'
import { toast } from 'vue-sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import DataTable from '@/components/common/DataTable.vue'
import DataTableTextFilter from '@/components/common/DataTableTextFilter.vue'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRemoteList } from '@/composables/useRemoteList'
import type {
  AiAutomation,
  AiAutomationInput,
  AiAutomationRun,
  AutomationListItem,
} from '@/features/ai-automations/api'
import {
  createAiAutomation,
  deleteAiAutomation,
  getAiAutomation,
  isAiAutomationConflict,
  listAiAutomations,
  runAiAutomationNow,
  setAiAutomationEnabled,
  updateAiAutomation,
} from '@/features/ai-automations/api'
import AiAutomationFormDialog from '@/features/ai-automations/components/AiAutomationFormDialog.vue'
import { formatDateTime } from '@/lib/format'
import { usePermission } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

const { t, locale } = useI18n()
const auth = useAuthStore()
const { can } = usePermission()
const automations = ref<AutomationListItem[]>([])
const nameSearch = ref('')
const scheduleSearch = ref('')
const page = ref(1)
const pageCount = ref(1)
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const formOpen = ref(false)
const historyOpen = ref(false)
const automationToEdit = ref<AiAutomation | null>(null)
const automationToDelete = ref<AutomationListItem | null>(null)
const selectedAutomation = ref<AiAutomation | null>(null)
const historyRuns = ref<AiAutomationRun[]>([])
const historyPage = ref(1)
const historyPageCount = ref(1)
const historyLoading = ref(false)

function hasActiveRun(run: AutomationListItem['latestRun'] | AiAutomationRun | null) {
  return run?.status === 'queued' || run?.status === 'running'
}

function webhookMayBeDelivering(run: AiAutomationRun) {
  return (
    !run.deliveryResults.webhook &&
    Date.now() - new Date(run.completedAt ?? run.createdAt).getTime() < 30_000
  )
}

async function loadPage(nextPage: number, isCurrent: () => boolean = () => true) {
  loading.value = true
  try {
    const result = await listAiAutomations(auth.token, nextPage, {
      name: nameSearch.value,
      schedule: scheduleSearch.value,
    })
    if (!isCurrent()) return
    automations.value = result.items
    pageCount.value = Math.max(1, result.meta.lastPage)
  } catch {
    if (isCurrent()) toast.error(t('ai_automations.fetch_failed'))
  } finally {
    if (isCurrent()) loading.value = false
  }
}

const { runLoad } = useRemoteList(page, loadPage)

function resetFilters() {
  nameSearch.value = ''
  scheduleSearch.value = ''
  void runLoad(1)
}

async function loadHistory(nextPage = historyPage.value) {
  if (!selectedAutomation.value) return
  historyLoading.value = true
  try {
    const result = await getAiAutomation(auth.token, selectedAutomation.value.id, nextPage)
    selectedAutomation.value = result.automation
    historyRuns.value = result.runs.items
    historyPage.value = result.runs.meta.currentPage
    historyPageCount.value = Math.max(1, result.runs.meta.lastPage)
  } catch {
    toast.error(t('ai_automations.fetch_history_failed'))
  } finally {
    historyLoading.value = false
  }
}

async function openHistory(automation: AiAutomation | AutomationListItem) {
  selectedAutomation.value = automation
  historyRuns.value = []
  historyPage.value = 1
  historyOpen.value = true
  await loadHistory(1)
}

function openForm(automation: AiAutomation | null = null) {
  if (!can('ai-automations:manage')) return
  automationToEdit.value = automation
  formOpen.value = true
}

async function saveAutomation(input: AiAutomationInput & { enabled: boolean }) {
  saving.value = true
  try {
    if (automationToEdit.value) {
      await updateAiAutomation(auth.token, automationToEdit.value.id, input)
    } else {
      const createInput: AiAutomationInput = {
        name: input.name,
        prompt: input.prompt,
        schedule: input.schedule,
        webhookUrl: input.webhookUrl,
      }
      await createAiAutomation(auth.token, createInput)
    }
    formOpen.value = false
    toast.success(t('ai_automations.save_success'))
    await runLoad(page.value)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('ai_automations.save_failed'))
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(automation: AutomationListItem) {
  try {
    await setAiAutomationEnabled(auth.token, automation.id, !automation.enabled)
    toast.success(t(automation.enabled ? 'ai_automations.paused' : 'ai_automations.resumed'))
    await runLoad(page.value)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('ai_automations.save_failed'))
  }
}

async function runNow(automation: AutomationListItem) {
  try {
    await runAiAutomationNow(auth.token, automation.id)
    toast.success(t('ai_automations.run_queued'))
    await runLoad(page.value)
  } catch (error) {
    toast.error(
      isAiAutomationConflict(error)
        ? t('ai_automations.run_active')
        : t('ai_automations.run_failed')
    )
  }
}

async function confirmDelete() {
  if (!automationToDelete.value) return
  deleting.value = true
  try {
    await deleteAiAutomation(auth.token, automationToDelete.value.id)
    automationToDelete.value = null
    toast.success(t('ai_automations.delete_success'))
    await runLoad(page.value)
  } catch (error) {
    toast.error(
      isAiAutomationConflict(error)
        ? t('ai_automations.delete_active')
        : t('ai_automations.delete_failed')
    )
  } finally {
    deleting.value = false
  }
}

function formatSchedule(automation: AiAutomation) {
  const { schedule } = automation
  if (schedule.cron) return schedule.cron
  const kind = t(`ai_automations.schedule_kind.${schedule.kind}`)
  const time = schedule.kind === 'once' ? schedule.at?.replace('T', ' ') : schedule.time
  const weekday =
    schedule.kind === 'weekly' ? ` · ${t(`ai_automations.weekdays.${schedule.weekday}`)}` : ''
  return `${kind}${weekday} · ${time ?? ''}`
}

function statusLabel(status: AiAutomationRun['status']) {
  return t(`ai_automations.status.${status}`)
}

function formatNextRun(value: string | null, timezone: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(value))
}

function statusVariant(status: AiAutomationRun['status']) {
  if (status === 'failed') return 'destructive' as const
  if (status === 'completed') return 'secondary' as const
  if (status === 'queued' || status === 'running') return 'default' as const
  return 'outline' as const
}

const columns = computed<ColumnDef<AutomationListItem>[]>(() => [
  {
    accessorKey: 'name',
    meta: { label: t('ai_automations.name') },
    header: () => t('ai_automations.name'),
    cell: ({ row }) =>
      h(
        'div',
        { class: 'max-w-56 truncate font-medium', title: row.original.name },
        row.original.name
      ),
  },
  {
    id: 'schedule',
    meta: { label: t('ai_automations.schedule') },
    header: () => t('ai_automations.schedule'),
    cell: ({ row }) =>
      h(
        'div',
        {
          class: 'max-w-80 truncate text-sm text-muted-foreground',
          title: formatSchedule(row.original),
        },
        formatSchedule(row.original)
      ),
  },
  {
    accessorKey: 'nextRunAt',
    meta: { label: t('ai_automations.next_run') },
    header: () => t('ai_automations.next_run'),
    cell: ({ row }) =>
      formatNextRun(
        row.original.enabled ? row.original.nextRunAt : null,
        row.original.schedule.timezone
      ),
  },
  {
    accessorKey: 'enabled',
    meta: { label: t('ai_automations.state') },
    header: () => t('ai_automations.state'),
    cell: ({ row }) =>
      h(Badge, { variant: row.original.enabled ? 'secondary' : 'outline' }, () =>
        t(row.original.enabled ? 'ai_automations.enabled' : 'ai_automations.disabled')
      ),
  },
  {
    id: 'latestRun',
    meta: { label: t('ai_automations.latest_run') },
    header: () => t('ai_automations.latest_run'),
    cell: ({ row }) =>
      row.original.latestRun
        ? h(Badge, { variant: statusVariant(row.original.latestRun.status) }, () =>
            statusLabel(row.original.latestRun!.status)
          )
        : h('span', { class: 'text-sm text-muted-foreground' }, t('ai_automations.no_runs')),
  },
  {
    id: 'actions',
    enableHiding: false,
    meta: { label: t('common.actions') },
    header: () => h('div', { class: 'text-right' }, t('common.actions')),
    cell: ({ row }) => {
      const automation = row.original
      return h('div', { class: 'flex justify-end gap-1' }, [
        can('ai-automations:run')
          ? h(
              Button,
              {
                variant: 'ghost',
                size: 'icon',
                title: t('ai_automations.run_now'),
                'aria-label': t('ai_automations.run_now'),
                disabled: hasActiveRun(automation.latestRun),
                onClick: () => void runNow(automation),
              },
              () => h(Play, { class: 'size-4' })
            )
          : null,
        h(
          Button,
          {
            variant: 'ghost',
            size: 'icon',
            title: t('ai_automations.run_history'),
            'aria-label': t('ai_automations.run_history'),
            onClick: () => void openHistory(automation),
          },
          () => h(History, { class: 'size-4' })
        ),
        h(
          DropdownMenu,
          { modal: false },
          {
            default: () => [
              h(DropdownMenuTrigger, { asChild: true }, () =>
                h(
                  Button,
                  {
                    variant: 'ghost',
                    size: 'icon',
                    title: t('common.more_actions'),
                    'aria-label': t('common.more_actions'),
                  },
                  () => h(MoreHorizontal, { class: 'size-4' })
                )
              ),
              h(DropdownMenuContent, { align: 'end' }, () => [
                can('ai-automations:manage')
                  ? h(DropdownMenuItem, { onSelect: () => openForm(automation) }, () =>
                      t('common.edit')
                    )
                  : null,
                can('ai-automations:manage') &&
                (automation.schedule.kind !== 'once' || automation.nextRunAt)
                  ? h(DropdownMenuItem, { onSelect: () => void toggleEnabled(automation) }, () =>
                      t(automation.enabled ? 'ai_automations.pause' : 'ai_automations.resume')
                    )
                  : null,
                can('ai-automations:manage')
                  ? h(
                      DropdownMenuItem,
                      {
                        class: 'text-destructive focus:text-destructive',
                        onSelect: () => {
                          automationToDelete.value = automation
                        },
                      },
                      () => t('common.delete')
                    )
                  : null,
              ]),
            ],
          }
        ),
      ])
    },
  },
])

useIntervalFn(() => {
  if (automations.value.some((item) => hasActiveRun(item.latestRun))) void runLoad(page.value)
  if (
    historyOpen.value &&
    historyRuns.value.some((run) => hasActiveRun(run) || webhookMayBeDelivering(run))
  ) {
    void loadHistory()
  }
}, 5_000)
</script>

<template>
  <ListPage
    :title="t('ai_automations.title')"
    :loading="loading"
    :action-label="t('ai_automations.create')"
    :show-action="can('ai-automations:manage')"
    @action="openForm()"
  >
    <DataTable
      :columns="columns"
      :data="automations"
      storage-key="ai-automations-table"
      :empty-message="loading ? t('common.loading') : t('ai_automations.empty')"
      :server-pagination="{ page, pageCount }"
      @search="runLoad(1)"
      @reset="resetFilters"
      @page-change="page = $event"
    >
      <template #filters>
        <DataTableTextFilter
          id="ai-automation-name-search"
          v-model="nameSearch"
          :label="t('ai_automations.name')"
          :placeholder="t('ai_automations.search_name_placeholder')"
        />
        <DataTableTextFilter
          id="ai-automation-schedule-search"
          v-model="scheduleSearch"
          :label="t('ai_automations.schedule')"
          :placeholder="t('ai_automations.search_schedule_placeholder')"
        />
      </template>
    </DataTable>

    <template #dialogs>
      <Dialog v-model:open="formOpen">
        <AiAutomationFormDialog
          v-model:open="formOpen"
          :automation="automationToEdit"
          :saving="saving"
          :token="auth.token"
          @save="saveAutomation"
        />
      </Dialog>

      <Dialog v-model:open="historyOpen">
        <DialogContent class="flex max-h-[85vh] flex-col gap-4 overflow-hidden sm:max-w-3xl">
          <DialogHeader class="shrink-0">
            <DialogTitle>{{
              selectedAutomation?.name ?? t('ai_automations.run_history')
            }}</DialogTitle>
            <DialogDescription>{{ t('ai_automations.run_history_description') }}</DialogDescription>
          </DialogHeader>
          <div class="min-h-0 flex-1 overflow-y-auto">
            <div
              v-if="historyLoading && historyRuns.length === 0"
              class="py-8 text-center text-sm text-muted-foreground"
            >
              {{ t('common.loading') }}
            </div>
            <div
              v-else-if="historyRuns.length === 0"
              class="py-8 text-center text-sm text-muted-foreground"
            >
              {{ t('ai_automations.no_runs') }}
            </div>
            <div v-else class="space-y-3">
              <article
                v-for="run in historyRuns"
                :key="run.id"
                class="space-y-3 rounded-lg border p-4"
              >
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p class="font-medium">{{ formatDateTime(run.createdAt) }}</p>
                    <p class="text-xs text-muted-foreground">
                      {{ t(`ai_automations.trigger.${run.triggerKind}`) }} ·
                      {{ t('ai_automations.attempts', { count: run.attemptCount }) }}
                    </p>
                  </div>
                  <Badge :variant="statusVariant(run.status)">{{ statusLabel(run.status) }}</Badge>
                </div>
                <p v-if="run.summary" class="text-sm break-words whitespace-pre-wrap">
                  {{ run.summary.trim() }}
                </p>
                <p v-if="run.error" class="text-sm whitespace-pre-wrap text-destructive">
                  {{ run.error }}
                </p>
                <div
                  v-if="run.deliveryResults.webhook"
                  class="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span>{{ t('ai_automations.webhook_delivery') }}</span>
                  <Badge
                    :variant="
                      run.deliveryResults.webhook.status === 'sent' ? 'secondary' : 'destructive'
                    "
                  >
                    {{ t(`ai_automations.delivery.${run.deliveryResults.webhook.status}`) }}
                  </Badge>
                  <span v-if="run.deliveryResults.webhook.error" class="text-muted-foreground">{{
                    run.deliveryResults.webhook.error
                  }}</span>
                </div>
              </article>
              <div v-if="historyPageCount > 1" class="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="historyPage <= 1 || historyLoading"
                  @click="loadHistory(historyPage - 1)"
                >
                  <ChevronLeft class="size-4" />{{ t('common.previous') }}
                </Button>
                <span class="text-sm text-muted-foreground">{{
                  t('ai_automations.page', { page: historyPage, total: historyPageCount })
                }}</span>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="historyPage >= historyPageCount || historyLoading"
                  @click="loadHistory(historyPage + 1)"
                >
                  {{ t('common.next') }}<ChevronRight class="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        :open="automationToDelete !== null"
        :title="t('ai_automations.confirm_delete_title')"
        :description="t('ai_automations.confirm_delete_description')"
        :loading="deleting"
        @update:open="
          (open) => {
            if (!open) automationToDelete = null
          }
        "
        @confirm="confirmDelete"
      />
    </template>
  </ListPage>
</template>
