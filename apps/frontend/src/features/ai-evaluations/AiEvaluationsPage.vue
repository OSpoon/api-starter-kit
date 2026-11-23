<script setup lang="ts">
import { Check, History, LoaderCircle, MoreHorizontal, Play, TrendingUp, X } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { useIntervalFn } from '@vueuse/core'
import { toast } from 'vue-sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import DataTable from '@/components/common/DataTable.vue'
import DataTableFacetFilter from '@/components/common/DataTableFacetFilter.vue'
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
  AiEvaluationCase,
  AiEvaluationCaseHistoryItem,
  AiEvaluationCaseInput,
  AiEvaluationRun,
  AiEvaluationSource,
} from '@/features/ai-evaluations/api'
import {
  createAiEvaluationCase,
  deleteAiEvaluationCase,
  getAiEvaluationRun,
  isAiEvaluationConflict,
  listAiEvaluationCaseHistory,
  listAiEvaluationCases,
  listAiEvaluationRuns,
  startAiEvaluationRun,
  updateAiEvaluationCase,
} from '@/features/ai-evaluations/api'
import AiEvaluationCaseFormDialog from '@/features/ai-evaluations/components/AiEvaluationCaseFormDialog.vue'
import AiEvaluationCaseHistoryChart from '@/features/ai-evaluations/components/AiEvaluationCaseHistoryChart.vue'
import { formatDateTime } from '@/lib/format'
import { usePermission } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { t, locale } = useI18n()
const { can } = usePermission()
const caseHistoryPageSize = 20
const cases = ref<AiEvaluationCase[]>([])
const selectedCaseIds = ref<number[]>([])
const nameSearch = ref('')
const questionSearch = ref('')
const sourceFilter = ref<AiEvaluationSource[]>([])
const page = ref(1)
const pageCount = ref(1)
const totalCases = ref(0)
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const runsLoading = ref(false)
const runs = ref<AiEvaluationRun[]>([])
const caseFormOpen = ref(false)
const historyDialogOpen = ref(false)
const caseHistoryDialogOpen = ref(false)
const runDialogOpen = ref(false)
const pendingCase = ref<AiEvaluationCase | null>(null)
const caseToDelete = ref<AiEvaluationCase | null>(null)
const runCaseIds = ref<number[] | undefined>(undefined)
const clearSelectionAfterRun = ref<(() => void) | null>(null)
const confirmAction = ref<'delete' | 'run' | null>(null)
const currentRun = ref<AiEvaluationRun | null>(null)
const caseHistoryCase = ref<AiEvaluationCase | null>(null)
const caseHistoryItems = ref<AiEvaluationCaseHistoryItem[]>([])
const selectedHistoryItem = ref<AiEvaluationCaseHistoryItem | null>(null)
const caseHistoryLoading = ref(false)
const caseHistoryPage = ref(1)
const caseHistoryPageCount = ref(1)
const caseHistoryTotal = ref(0)

const sourceOptions = computed(() => [
  { value: 'chat', label: t('ai_evaluations.source_chat') },
  { value: 'manual', label: t('ai_evaluations.source_manual') },
])

async function fetchCases(nextPage = page.value, isCurrent: () => boolean = () => true) {
  loading.value = true
  try {
    const source = sourceFilter.value.length === 1 ? sourceFilter.value[0] : undefined
    const result = await listAiEvaluationCases(
      auth.token,
      nextPage,
      nameSearch.value,
      questionSearch.value,
      source
    )
    if (!isCurrent()) return
    cases.value = result.items
    page.value = result.meta.currentPage
    pageCount.value = result.meta.lastPage
    totalCases.value = result.meta.total
  } catch (error) {
    if (isCurrent())
      toast.error(error instanceof Error ? error.message : t('ai_evaluations.fetch_failed'))
  } finally {
    if (isCurrent()) loading.value = false
  }
}
const { runLoad } = useRemoteList(page, fetchCases)

const columns = computed<ColumnDef<AiEvaluationCase>[]>(() => [
  {
    accessorKey: 'name',
    meta: { label: t('ai_evaluations.case_name') },
    header: () => t('ai_evaluations.case_name'),
    cell: ({ row }) =>
      h(
        'div',
        { class: 'max-w-56 truncate font-medium', title: row.original.name },
        row.original.name
      ),
  },
  {
    accessorKey: 'question',
    meta: { label: t('ai_evaluations.question') },
    header: () => t('ai_evaluations.question'),
    cell: ({ row }) =>
      h(
        'div',
        { class: 'max-w-96 truncate text-sm text-muted-foreground', title: row.original.question },
        row.original.question
      ),
  },
  {
    id: 'reference',
    meta: { label: t('ai_evaluations.reference_answer') },
    header: () => t('ai_evaluations.reference_answer'),
    cell: ({ row }) =>
      h(
        'div',
        {
          class: 'max-w-72 truncate text-sm text-muted-foreground',
          title: row.original.referenceAnswer,
        },
        row.original.referenceAnswer
      ),
  },
  {
    id: 'source',
    meta: { label: t('ai_evaluations.source') },
    header: () => t('ai_evaluations.source'),
    cell: ({ row }) =>
      h(Badge, { variant: 'outline' }, () =>
        t(
          row.original.sourceConversationId
            ? 'ai_evaluations.source_chat'
            : 'ai_evaluations.source_manual'
        )
      ),
  },
  {
    accessorKey: 'updatedAt',
    meta: { label: t('ai_evaluations.updated_at') },
    header: () => t('ai_evaluations.updated_at'),
    cell: ({ row }) => formatDateTime(row.original.updatedAt),
  },
  {
    id: 'actions',
    enableHiding: false,
    meta: { label: t('common.actions') },
    header: () => h('div', { class: 'text-right' }, t('common.actions')),
    cell: ({ row }) => {
      const item = row.original
      return h('div', { class: 'flex justify-end gap-1' }, [
        h(
          Button,
          {
            variant: 'ghost',
            size: 'icon',
            title: t('ai_evaluations.case_history'),
            'aria-label': t('ai_evaluations.case_history'),
            onClick: () => void openCaseHistory(item),
          },
          () => h(TrendingUp, { class: 'size-4' })
        ),
        can('ai-evaluations:run')
          ? h(
              Button,
              {
                variant: 'ghost',
                size: 'icon',
                title: t('ai_evaluations.run_single'),
                'aria-label': t('ai_evaluations.run_single'),
                onClick: () => requestRun([item.id]),
              },
              () => h(Play, { class: 'size-4' })
            )
          : null,
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
                can('ai-evaluations:manage')
                  ? h(DropdownMenuItem, { onSelect: () => openCaseForm(item) }, () =>
                      t('common.edit')
                    )
                  : null,
                can('ai-evaluations:manage')
                  ? h(
                      DropdownMenuItem,
                      {
                        class: 'text-destructive focus:text-destructive',
                        onSelect: () => requestDelete(item),
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

function resetFilters() {
  nameSearch.value = ''
  questionSearch.value = ''
  sourceFilter.value = []
  selectedCaseIds.value = []
  void runLoad(1)
}

async function openCaseForm(evaluationCase: AiEvaluationCase | null = null) {
  if (!can('ai-evaluations:manage')) return
  pendingCase.value = evaluationCase
  await nextTick()
  caseFormOpen.value = true
}

async function saveCase(input: AiEvaluationCaseInput) {
  saving.value = true
  try {
    if (pendingCase.value) {
      await updateAiEvaluationCase(auth.token, pendingCase.value.id, input)
    } else {
      await createAiEvaluationCase(auth.token, input)
    }
    caseFormOpen.value = false
    await runLoad()
    toast.success(t('ai_evaluations.save_success'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('ai_evaluations.save_failed'))
  } finally {
    saving.value = false
  }
}

function requestDelete(item: AiEvaluationCase) {
  caseToDelete.value = item
  confirmAction.value = 'delete'
}

async function confirmDelete() {
  if (!caseToDelete.value) return
  deleting.value = true
  try {
    await deleteAiEvaluationCase(auth.token, caseToDelete.value.id)
    confirmAction.value = null
    selectedCaseIds.value = selectedCaseIds.value.filter((id) => id !== caseToDelete.value?.id)
    await runLoad(cases.value.length <= 1 && page.value > 1 ? page.value - 1 : page.value)
    toast.success(t('ai_evaluations.delete_success'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('ai_evaluations.delete_failed'))
  } finally {
    deleting.value = false
  }
}

function requestRun(caseIds?: number[], clearSelection?: () => void) {
  if (!can('ai-evaluations:run')) return
  if (caseIds?.length === 0 || (!caseIds && totalCases.value === 0)) {
    toast.warning(t('ai_evaluations.no_cases_to_run'))
    return
  }
  if (caseIds && caseIds.length > 100) {
    toast.warning(t('ai_evaluations.run_limit'))
    return
  }
  if (!caseIds && totalCases.value > 100) {
    toast.warning(t('ai_evaluations.run_limit'))
    return
  }
  runCaseIds.value = caseIds
  clearSelectionAfterRun.value = clearSelection ?? null
  confirmAction.value = 'run'
}

async function confirmRun() {
  try {
    const run = await startAiEvaluationRun(auth.token, runCaseIds.value)
    currentRun.value = run
    runDialogOpen.value = true
    confirmAction.value = null
    clearSelectionAfterRun.value?.()
    clearSelectionAfterRun.value = null
    if (run.status === 'queued' || run.status === 'running') resumePolling()
    toast.success(t('ai_evaluations.run_started'))
  } catch (error) {
    toast.error(
      isAiEvaluationConflict(error)
        ? t('ai_evaluations.run_already_active')
        : error instanceof Error
          ? error.message
          : t('ai_evaluations.run_failed')
    )
  }
}

async function openRunHistory() {
  historyDialogOpen.value = true
  runsLoading.value = true
  try {
    const result = await listAiEvaluationRuns(auth.token)
    runs.value = result.items
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('ai_evaluations.fetch_runs_failed'))
  } finally {
    runsLoading.value = false
  }
}

async function loadCaseHistory(nextPage = caseHistoryPage.value) {
  const evaluationCase = caseHistoryCase.value
  if (!evaluationCase) return
  caseHistoryLoading.value = true
  try {
    const result = await listAiEvaluationCaseHistory(auth.token, evaluationCase.id, nextPage)
    caseHistoryItems.value = result.items
    caseHistoryPage.value = result.meta.currentPage
    caseHistoryPageCount.value = result.meta.lastPage
    caseHistoryTotal.value = result.meta.total
    selectedHistoryItem.value = result.items[0] ?? null
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : t('ai_evaluations.fetch_case_history_failed')
    )
  } finally {
    caseHistoryLoading.value = false
  }
}

async function openCaseHistory(evaluationCase: AiEvaluationCase) {
  caseHistoryCase.value = evaluationCase
  caseHistoryItems.value = []
  selectedHistoryItem.value = null
  caseHistoryPage.value = 1
  caseHistoryPageCount.value = 1
  caseHistoryTotal.value = 0
  caseHistoryDialogOpen.value = true
  await loadCaseHistory(1)
}

function showRun(run: AiEvaluationRun) {
  currentRun.value = run
  historyDialogOpen.value = false
  runDialogOpen.value = true
  if (run.status === 'queued' || run.status === 'running') resumePolling()
}

async function pollCurrentRun() {
  const run = currentRun.value
  if (!run || (run.status !== 'queued' && run.status !== 'running')) return
  try {
    currentRun.value = await getAiEvaluationRun(auth.token, run.id)
    if (currentRun.value.status === 'completed' || currentRun.value.status === 'failed') {
      pausePolling()
    }
  } catch (error) {
    pausePolling()
    toast.error(error instanceof Error ? error.message : t('ai_evaluations.run_refresh_failed'))
  }
}

const { pause: pausePolling, resume: resumePolling } = useIntervalFn(pollCurrentRun, 1_500, {
  immediate: false,
})

const confirmTitle = computed(() =>
  confirmAction.value === 'run'
    ? t('ai_evaluations.confirm_run_title')
    : t('ai_evaluations.confirm_delete_title')
)
const confirmDescription = computed(() =>
  confirmAction.value === 'run'
    ? t('ai_evaluations.confirm_run_description', {
        count: runCaseIds.value?.length ?? totalCases.value,
      })
    : t('ai_evaluations.confirm_delete_description')
)
const confirmLabel = computed(() =>
  confirmAction.value === 'run' ? t('ai_evaluations.run') : t('common.delete')
)

function handleConfirmationOpenChange(open: boolean) {
  if (open) return
  confirmAction.value = null
  clearSelectionAfterRun.value = null
}
</script>

<template>
  <ListPage
    :title="t('ai_evaluations.title')"
    :loading="loading"
    :action-label="t('ai_evaluations.create_case')"
    :show-action="can('ai-evaluations:manage')"
    @action="openCaseForm()"
  >
    <DataTable
      :columns="columns"
      :data="cases"
      storage-key="ai-evaluations-table"
      :empty-message="loading ? t('common.loading') : t('ai_evaluations.no_cases')"
      :server-pagination="{ page, pageCount }"
      :selectable="can('ai-evaluations:run')"
      :get-row-id="(item) => String(item.id)"
      @selection-change="selectedCaseIds = $event.map((item) => item.id)"
      @search="runLoad(1)"
      @reset="resetFilters"
      @page-change="page = $event"
    >
      <template #toolbar-trailing>
        <div class="flex flex-wrap items-center gap-2">
          <Button
            v-if="can('ai-evaluations:run')"
            class="gap-1"
            variant="outline"
            @click="requestRun()"
          >
            <Play class="size-4" />{{ t('ai_evaluations.run_all') }}
          </Button>
          <Button class="gap-1" variant="outline" @click="openRunHistory">
            <History class="size-4" />{{ t('ai_evaluations.run_history') }}
          </Button>
        </div>
      </template>
      <template #filters>
        <DataTableTextFilter
          id="ai-evaluations-name-search"
          v-model="nameSearch"
          :label="t('ai_evaluations.case_name')"
          :placeholder="t('ai_evaluations.search_name_placeholder')"
        />
        <DataTableTextFilter
          id="ai-evaluations-question-search"
          v-model="questionSearch"
          :label="t('ai_evaluations.question')"
          :placeholder="t('ai_evaluations.search_question_placeholder')"
        />
        <DataTableFacetFilter
          v-model="sourceFilter"
          :label="t('ai_evaluations.source_filter')"
          :options="sourceOptions"
        />
      </template>
      <template #selection-actions="{ rows, clearSelection, disabled }">
        <Button
          v-if="can('ai-evaluations:run')"
          class="gap-1"
          size="sm"
          :disabled="disabled"
          @click="
            requestRun(
              rows.map((item) => item.id),
              clearSelection
            )
          "
        >
          <Play class="size-4" />
          {{ t('ai_evaluations.run_selected', { count: rows.length }) }}
        </Button>
      </template>
    </DataTable>

    <template #dialogs>
      <Dialog v-model:open="caseFormOpen">
        <AiEvaluationCaseFormDialog
          v-model:open="caseFormOpen"
          :evaluation-case="pendingCase"
          :saving="saving"
          @save="saveCase"
        />
      </Dialog>

      <Dialog v-model:open="historyDialogOpen">
        <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{{ t('ai_evaluations.run_history') }}</DialogTitle>
            <DialogDescription>{{ t('ai_evaluations.run_history_description') }}</DialogDescription>
          </DialogHeader>
          <div v-if="runsLoading" class="py-8 text-center text-sm text-muted-foreground">
            {{ t('common.loading') }}
          </div>
          <div v-else-if="runs.length === 0" class="py-8 text-center text-sm text-muted-foreground">
            {{ t('ai_evaluations.no_runs') }}
          </div>
          <div v-else class="space-y-2">
            <button
              v-for="run in runs"
              :key="run.id"
              type="button"
              class="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40"
              @click="showRun(run)"
            >
              <span class="min-w-0">
                <span class="block font-medium">{{ formatDateTime(run.createdAt) }}</span>
                <span class="block text-xs text-muted-foreground"
                  >{{ run.modelId }} · {{ run.completedCases }}/{{ run.totalCases }}</span
                >
              </span>
              <span class="flex items-center gap-2">
                <Badge variant="outline">{{ t(`ai_evaluations.status.${run.status}`) }}</Badge>
                <strong v-if="run.score !== null" class="text-sm">{{ run.score }}%</strong>
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog v-model:open="caseHistoryDialogOpen">
        <DialogContent class="flex max-h-[90vh] flex-col gap-4 overflow-hidden sm:max-w-lg">
          <DialogHeader class="shrink-0">
            <DialogTitle>{{ t('ai_evaluations.case_history') }}</DialogTitle>
            <DialogDescription>
              {{ caseHistoryCase?.name }} · {{ t('ai_evaluations.case_history_description') }}
            </DialogDescription>
          </DialogHeader>
          <div class="min-h-0 flex-1 overflow-y-auto pb-6">
            <div v-if="caseHistoryLoading" class="py-8 text-center text-sm text-muted-foreground">
              {{ t('common.loading') }}
            </div>
            <div
              v-else-if="caseHistoryItems.length === 0"
              class="py-8 text-center text-sm text-muted-foreground"
            >
              {{ t('ai_evaluations.no_case_history') }}
            </div>
            <div v-else class="space-y-5">
              <section class="rounded-xl border p-4">
                <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 class="font-medium">{{ t('ai_evaluations.score_trend') }}</h3>
                    <p class="text-xs text-muted-foreground">
                      {{ t('ai_evaluations.history_points', { count: caseHistoryTotal }) }}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {{ t('ai_evaluations.history_page', { page: caseHistoryPage }) }}
                  </Badge>
                </div>
                <AiEvaluationCaseHistoryChart
                  :items="caseHistoryItems"
                  :selected-run-id="selectedHistoryItem?.runId ?? null"
                  :locale="locale"
                  @select="selectedHistoryItem = $event"
                />
              </section>

              <article v-if="selectedHistoryItem" class="rounded-xl border p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 class="font-medium">{{ t('ai_evaluations.point_details') }}</h3>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {{ selectedHistoryItem.modelId }} ·
                      {{ formatDateTime(selectedHistoryItem.createdAt) }} ·
                      {{ t(`ai_evaluations.status.${selectedHistoryItem.status}`) }}
                    </p>
                  </div>
                  <Badge :variant="selectedHistoryItem.result.passed ? 'default' : 'destructive'">
                    {{ selectedHistoryItem.result.score }}%
                  </Badge>
                </div>
                <p class="mt-4 text-sm whitespace-pre-wrap">
                  {{ selectedHistoryItem.result.question }}
                </p>
                <div class="mt-4 grid gap-3">
                  <div class="rounded-lg bg-muted/30 p-3">
                    <p
                      class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      {{ t('ai_evaluations.reference_answer') }}
                    </p>
                    <p class="text-sm whitespace-pre-wrap">
                      {{ selectedHistoryItem.result.referenceAnswer }}
                    </p>
                  </div>
                  <div class="rounded-lg bg-muted/30 p-3">
                    <p
                      class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      {{ t('ai_evaluations.actual_answer') }}
                    </p>
                    <p class="text-sm whitespace-pre-wrap">
                      {{
                        selectedHistoryItem.result.actualAnswer ||
                        selectedHistoryItem.result.error ||
                        t('ai_evaluations.empty_answer')
                      }}
                    </p>
                  </div>
                </div>
              </article>

              <div
                v-if="caseHistoryPageCount > 1"
                class="flex flex-wrap items-center justify-between gap-3"
              >
                <p class="text-xs text-muted-foreground">
                  {{
                    t('ai_evaluations.history_range', {
                      start: (caseHistoryPage - 1) * caseHistoryPageSize + 1,
                      end: Math.min(caseHistoryPage * caseHistoryPageSize, caseHistoryTotal),
                      total: caseHistoryTotal,
                    })
                  }}
                </p>
                <div class="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="caseHistoryLoading || caseHistoryPage <= 1"
                    @click="loadCaseHistory(caseHistoryPage - 1)"
                  >
                    {{ t('ai_evaluations.newer_history') }}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="caseHistoryLoading || caseHistoryPage >= caseHistoryPageCount"
                    @click="loadCaseHistory(caseHistoryPage + 1)"
                  >
                    {{ t('ai_evaluations.older_history') }}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog v-model:open="runDialogOpen">
        <DialogContent class="flex max-h-[90vh] flex-col gap-4 overflow-hidden sm:max-w-3xl">
          <DialogHeader class="shrink-0">
            <DialogTitle>{{ t('ai_evaluations.run_result_title') }}</DialogTitle>
            <DialogDescription>
              <span v-if="currentRun"
                >{{ currentRun.modelId }} · {{ currentRun.completedCases }}/{{
                  currentRun.totalCases
                }}
                {{ t('ai_evaluations.completed_cases') }}</span
              >
            </DialogDescription>
          </DialogHeader>
          <div v-if="currentRun" class="min-h-0 overflow-y-auto pb-6">
            <div
              class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-4"
            >
              <div>
                <p class="font-medium">{{ t(`ai_evaluations.status.${currentRun.status}`) }}</p>
                <p v-if="currentRun.error" class="mt-1 text-sm text-destructive">
                  {{ currentRun.error }}
                </p>
              </div>
              <div class="text-right">
                <p class="text-2xl font-semibold tabular-nums">
                  {{ currentRun.score === null ? '—' : `${currentRun.score}%` }}
                </p>
                <p class="text-xs text-muted-foreground">{{ t('ai_evaluations.overall_score') }}</p>
              </div>
            </div>
            <div
              v-if="currentRun.results.length === 0"
              class="flex items-center justify-center gap-2 rounded-lg border border-dashed py-6 text-sm text-muted-foreground"
            >
              <LoaderCircle
                v-if="currentRun.status === 'queued' || currentRun.status === 'running'"
                class="size-4 animate-spin"
              />
              <span>{{
                currentRun.status === 'queued' || currentRun.status === 'running'
                  ? t('ai_evaluations.run_in_progress')
                  : t('ai_evaluations.no_results')
              }}</span>
            </div>
            <div v-else class="space-y-4">
              <article
                v-for="result in currentRun.results"
                :key="result.caseId"
                class="rounded-xl border p-4"
              >
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-2">
                    <component
                      :is="result.passed ? Check : X"
                      class="size-4 shrink-0"
                      :class="result.passed ? 'text-emerald-600' : 'text-destructive'"
                    />
                    <h3 class="truncate font-medium">{{ result.caseName }}</h3>
                  </div>
                  <Badge :variant="result.passed ? 'default' : 'destructive'"
                    >{{ result.score }}%</Badge
                  >
                </div>
                <p class="mt-3 text-sm whitespace-pre-wrap">{{ result.question }}</p>
                <div class="mt-4 grid gap-3">
                  <div class="rounded-lg bg-muted/30 p-3">
                    <p
                      class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      {{ t('ai_evaluations.reference_answer') }}
                    </p>
                    <p class="text-sm whitespace-pre-wrap">{{ result.referenceAnswer }}</p>
                  </div>
                  <div class="rounded-lg bg-muted/30 p-3">
                    <p
                      class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      {{ t('ai_evaluations.actual_answer') }}
                    </p>
                    <p class="text-sm whitespace-pre-wrap">
                      {{ result.actualAnswer || result.error || t('ai_evaluations.empty_answer') }}
                    </p>
                  </div>
                </div>
                <div class="mt-3 grid gap-2 sm:grid-cols-2">
                  <p class="text-xs text-muted-foreground">
                    {{ t('ai_evaluations.tool_check') }}:
                    {{ result.actualTools.join(' → ') || t('ai_evaluations.no_tool_calls') }}
                    <span :class="result.toolsPassed ? 'text-emerald-600' : 'text-destructive'">{{
                      result.toolsPassed
                        ? ` · ${t('ai_evaluations.check_passed')}`
                        : ` · ${t('ai_evaluations.check_failed')}`
                    }}</span>
                  </p>
                  <p class="text-xs text-muted-foreground">
                    {{ t('ai_evaluations.reference_similarity') }}:
                    <span
                      :class="
                        result.referenceSimilarity >= 50 ? 'text-emerald-600' : 'text-destructive'
                      "
                      >{{ result.referenceSimilarity }}%</span
                    >
                  </p>
                  <p class="text-xs text-muted-foreground">
                    {{ t('ai_evaluations.rubric_check') }}:
                    <span
                      v-for="check in [...result.requiredTerms, ...result.forbiddenTerms]"
                      :key="check.term"
                      class="mr-2 inline-flex items-center gap-1"
                      :class="check.passed ? 'text-emerald-600' : 'text-destructive'"
                    >
                      {{ check.passed ? '✓' : '×' }} {{ check.term }}
                    </span>
                    <span v-if="!result.requiredTerms.length && !result.forbiddenTerms.length">{{
                      t('ai_evaluations.no_rubric_terms')
                    }}</span>
                  </p>
                </div>
              </article>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        :open="confirmAction !== null"
        :title="confirmTitle"
        :description="confirmDescription"
        :loading="deleting"
        :confirm-label="confirmLabel"
        @update:open="handleConfirmationOpenChange"
        @confirm="confirmAction === 'run' ? confirmRun() : confirmDelete()"
      />
    </template>
  </ListPage>
</template>
