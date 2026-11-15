<script setup lang="ts">
import { ChevronDown, Play, Search, Square, Terminal, Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'

import PageShell from '@/components/common/PageShell.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { streamBackendLogs } from '@/features/backend-logs/api'
import { type BackendLogLevel, formatBackendLogLine } from '@/features/backend-logs/format'
import { useAuthStore } from '@/stores/auth'

const { t, locale } = useI18n()
const auth = useAuthStore()
const logLines = ref<string[]>([])
const search = ref('')
const state = ref<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')
const logViewport = ref<HTMLDivElement | null>(null)
let controller: AbortController | undefined

const visibleLines = computed(() => {
  const query = search.value.trim().toLowerCase()
  return query
    ? logLines.value.filter((line) => line.toLowerCase().includes(query))
    : logLines.value
})
const visibleLogEntries = computed(() => visibleLines.value.map(formatBackendLogLine))
const isStreaming = computed(() => state.value === 'connecting' || state.value === 'connected')
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
  <PageShell
    :title="t('backend_logs.title')"
    :description="t('backend_logs.description')"
    class="min-h-0 gap-4"
  >
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div class="flex flex-wrap items-center gap-3 border-b bg-muted/20 p-3">
        <label for="backend-log-search" class="shrink-0 text-sm font-medium">
          {{ t('backend_logs.search_label') }}
        </label>
        <div class="relative min-w-40 flex-1">
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="backend-log-search"
            v-model="search"
            class="h-9 pl-9"
            :placeholder="t('backend_logs.search_placeholder')"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              variant="outline"
              size="sm"
              type="button"
              :title="t('backend_logs.more_actions')"
              :aria-label="t('backend_logs.more_actions')"
            >
              {{ t('backend_logs.more_actions') }}
              <ChevronDown class="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @select="toggleStream">
              <Square v-if="isStreaming" />
              <Play v-else />
              {{ isStreaming ? t('backend_logs.stop') : t('backend_logs.start') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              :disabled="logLines.length === 0"
              @select="clearLogs"
            >
              <Trash2 />
              {{ t('backend_logs.clear') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        class="flex shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-900 px-4 py-2"
      >
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
        <span class="font-mono text-xs text-slate-200">{{
          t('backend_logs.terminal_source')
        }}</span>
        <span class="ml-auto font-mono text-[11px] tracking-wide text-slate-500 uppercase">
          {{ t(`backend_logs.status_${state}`) }}
        </span>
      </div>

      <div
        ref="logViewport"
        class="min-h-0 flex-1 overflow-auto bg-slate-950 px-4 py-3 text-slate-100"
        role="log"
        aria-live="off"
        :aria-label="t('backend_logs.log_output')"
      >
        <div
          v-if="visibleLogEntries.length === 0"
          class="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-center text-slate-400"
        >
          <Terminal v-if="!search.trim()" class="size-5 opacity-70" />
          <p class="text-sm">
            {{ search.trim() ? t('backend_logs.no_matches') : t('backend_logs.empty') }}
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
  </PageShell>
</template>
