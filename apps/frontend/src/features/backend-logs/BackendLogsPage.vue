<script setup lang="ts">
import { Play, RotateCcw, Search, Square, Terminal, Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'

import DataTableFacetFilter from '@/components/common/DataTableFacetFilter.vue'
import DataTableTextFilter from '@/components/common/DataTableTextFilter.vue'
import PageShell from '@/components/common/PageShell.vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { streamBackendLogs } from '@/features/backend-logs/api'
import { type BackendLogLevel, formatBackendLogLine } from '@/features/backend-logs/format'
import { useAuthStore } from '@/stores/auth'

const { t, locale } = useI18n()
const auth = useAuthStore()
const logLines = ref<string[]>([])
const search = ref('')
const levels = ref<string[]>([])
const filters = ref<{ keyword: string; levels: string[] }>({ keyword: '', levels: [] })
const state = ref<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')
const logViewport = ref<HTMLDivElement | null>(null)
let controller: AbortController | undefined

const logEntries = computed(() => logLines.value.map(formatBackendLogLine))
const visibleLogEntries = computed(() =>
  logEntries.value.filter(
    (entry) =>
      (!filters.value.keyword || entry.raw.toLowerCase().includes(filters.value.keyword)) &&
      (!filters.value.levels.length || filters.value.levels.includes(entry.level))
  )
)
const hasFilters = computed(() => Boolean(filters.value.keyword || filters.value.levels.length))
const isStreaming = computed(() => state.value === 'connecting' || state.value === 'connected')
const streamActionLabel = computed(() =>
  t(isStreaming.value ? 'backend_logs.stop' : 'backend_logs.start')
)
const levelClasses: Record<BackendLogLevel, string> = {
  trace: 'text-slate-500',
  debug: 'text-sky-300',
  info: 'text-emerald-400',
  warn: 'text-amber-300',
  error: 'text-rose-400',
  fatal: 'text-fuchsia-400',
  raw: 'text-slate-500',
}
const messageClasses: Record<BackendLogLevel, string> = {
  trace: 'text-slate-400',
  debug: 'text-slate-300',
  info: 'text-slate-100',
  warn: 'text-amber-100',
  error: 'text-rose-300',
  fatal: 'text-fuchsia-300',
  raw: 'text-slate-300',
}
const levelOptions = computed(() =>
  Object.keys(levelClasses).map((value) => ({
    value,
    label: value === 'raw' ? t('backend_logs.level_raw') : value.toUpperCase(),
  }))
)

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(locale.value, {
    month: '2-digit',
    day: '2-digit',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  }).format(timestamp)
}

async function connect() {
  if (controller) return
  const requestController = new AbortController()
  controller = requestController
  state.value = 'connecting'

  try {
    await streamBackendLogs(
      auth.token,
      (line) => {
        logLines.value.push(line)
        if (logLines.value.length > 500) logLines.value.splice(0, logLines.value.length - 500)
      },
      () => (state.value = 'connected'),
      requestController.signal
    )
    if (!requestController.signal.aborted) state.value = 'disconnected'
  } catch (error) {
    if (!requestController.signal.aborted) {
      state.value = 'error'
      toast.error(error instanceof Error ? error.message : t('backend_logs.stream_error'))
    }
  } finally {
    if (controller === requestController) controller = undefined
  }
}

function disconnect() {
  controller?.abort()
  controller = undefined
  state.value = 'disconnected'
}

function toggleStream() {
  if (isStreaming.value) disconnect()
  else void connect()
}

function clearLogs() {
  logLines.value = []
}

function applyFilters() {
  filters.value = { keyword: search.value.trim().toLowerCase(), levels: [...levels.value] }
}

function resetFilters() {
  search.value = ''
  levels.value = []
  applyFilters()
}

watch(
  () => visibleLogEntries.value[visibleLogEntries.value.length - 1]?.raw,
  () => {
    if (logViewport.value) logViewport.value.scrollTop = logViewport.value.scrollHeight
  },
  { flush: 'post' }
)

onMounted(() => void connect())
onBeforeUnmount(disconnect)
</script>

<template>
  <PageShell title="" header-class="hidden" class="min-h-0 gap-4 overflow-hidden pt-8 pb-0">
    <section class="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <fieldset class="min-w-0 shrink-0 rounded-md border bg-muted/20 px-3 pb-3">
        <legend class="px-2 font-display text-xl font-semibold tracking-tight">
          {{ t('backend_logs.title') }}
        </legend>
        <form
          class="grid grid-cols-1 items-end gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-4"
          @submit.prevent="applyFilters"
        >
          <DataTableTextFilter
            id="backend-log-search"
            v-model="search"
            :label="t('backend_logs.search_label')"
            :placeholder="t('backend_logs.search_placeholder')"
          />
          <DataTableFacetFilter
            v-model="levels"
            :label="t('backend_logs.level')"
            :options="levelOptions"
          />
          <div class="flex justify-end gap-2 sm:col-start-2 xl:col-start-4">
            <Button type="button" variant="outline" @click="resetFilters">
              <RotateCcw class="size-4" />
              {{ t('common.reset') }}
            </Button>
            <Button type="submit">
              <Search class="size-4" />
              {{ t('common.query') }}
            </Button>
          </div>
        </form>
      </fieldset>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border">
        <div
          class="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-800 bg-slate-900 px-4 py-1"
        >
          <div class="flex items-center gap-2">
            <span
              class="size-2 shrink-0 rounded-full"
              :class="
                state === 'connected'
                  ? 'bg-emerald-400'
                  : state === 'error'
                    ? 'bg-rose-400'
                    : 'bg-amber-300'
              "
            />
            <span class="font-mono text-xs text-slate-200">
              {{ t('backend_logs.terminal_source') }}
            </span>
          </div>
          <div class="ml-auto flex items-center gap-3">
            <span
              role="status"
              class="font-mono text-[11px] tracking-wide text-slate-400 uppercase"
            >
              {{ t(`backend_logs.status_${state}`) }}
            </span>
            <div class="flex items-center gap-0.5 border-l border-slate-700 pl-2">
              <TooltipProvider :delay-duration="200">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      class="text-slate-300 hover:bg-slate-800 hover:text-white dark:hover:bg-slate-800"
                      :aria-label="streamActionLabel"
                      @click="toggleStream"
                    >
                      <Square v-if="isStreaming" />
                      <Play v-else />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{{ streamActionLabel }}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      class="text-slate-300 hover:bg-slate-800 hover:text-white dark:hover:bg-slate-800"
                      :aria-label="t('backend_logs.clear')"
                      :disabled="logLines.length === 0"
                      @click="clearLogs"
                    >
                      <Trash2 />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{{ t('backend_logs.clear') }}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        <div
          ref="logViewport"
          tabindex="0"
          class="min-h-0 flex-1 overflow-auto bg-slate-950 px-4 py-3 text-slate-100"
          role="log"
          aria-live="off"
          :aria-label="t('backend_logs.log_output')"
          aria-describedby="backend-log-description"
        >
          <div
            v-if="visibleLogEntries.length === 0"
            class="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-center text-slate-400"
          >
            <Terminal v-if="!hasFilters" class="size-5 opacity-70" />
            <p class="text-sm">
              {{ hasFilters ? t('backend_logs.no_matches') : t('backend_logs.empty') }}
            </p>
          </div>
          <div
            v-for="(entry, index) in visibleLogEntries"
            :key="`${index}:${entry.raw}`"
            class="flex min-w-max items-baseline gap-3 font-mono text-xs leading-5"
          >
            <template v-if="entry.structured">
              <span v-if="entry.timestamp !== null" class="shrink-0 text-slate-500">
                {{ formatTimestamp(entry.timestamp) }}
              </span>
              <span class="w-12 shrink-0 font-semibold" :class="levelClasses[entry.level]">
                {{ entry.level.toUpperCase() }}
              </span>
              <span class="shrink-0" :class="messageClasses[entry.level]">{{ entry.message }}</span>
              <template v-for="field in entry.fields" :key="field.key">
                <span class="shrink-0 text-sky-400">{{ field.key }}</span>
                <span class="shrink-0 text-slate-400">{{ field.value }}</span>
              </template>
            </template>
            <pre v-else class="m-0 whitespace-pre text-slate-300">{{ entry.raw }}</pre>
          </div>
        </div>
      </div>
      <p id="backend-log-description" class="sr-only">{{ t('backend_logs.description') }}</p>
    </section>
  </PageShell>
</template>
