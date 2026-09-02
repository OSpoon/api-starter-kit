<script setup lang="ts">
import { Activity, Cpu, HardDrive, MemoryStick, RefreshCw, Server, Terminal } from '@lucide/vue'
import { useIntervalFn } from '@vueuse/core'

import PageShell from '@/components/common/PageShell.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/stores/auth'

import { getSystemStatus, type SystemStatus } from './api'

const { t } = useI18n()
const auth = useAuthStore()
const status = ref<SystemStatus | null>(null)
const loading = ref(true)
const error = ref(false)
const now = ref(new Date())

const disk = computed(() => status.value?.disks[0])
const cards = computed(() => [
  {
    label: t('system_status.cpu_average'),
    value: `${status.value?.cpu.averagePercent ?? 0}%`,
    icon: Cpu,
  },
  {
    label: t('system_status.memory'),
    value: `${status.value?.memory.usedPercent ?? 0}%`,
    detail: status.value ? `${status.value.memory.usedGb} / ${status.value.memory.totalGb} GB` : '',
    icon: MemoryStick,
  },
  {
    label: t('system_status.disk_highest'),
    value: `${disk.value?.usedPercent ?? 0}%`,
    icon: HardDrive,
  },
  {
    label: t('system_status.active_handles'),
    value: `${status.value?.runtime.activeHandles ?? 0}`,
    icon: Activity,
  },
])

function formatBytes(bytes: number) {
  return `${Math.round((bytes / 1024 ** 3) * 10) / 10} GB`
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return days ? `${days}d ${hours}h` : `${hours}h ${minutes}m`
}

async function refresh() {
  loading.value = true
  error.value = false
  try {
    status.value = await getSystemStatus(auth.token)
    now.value = new Date()
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

useIntervalFn(() => void refresh(), 10_000, { immediateCallback: true })
</script>

<template>
  <PageShell
    :title="t('system_status.title')"
    :description="t('system_status.description')"
    class="gap-4"
  >
    <template #actions>
      <Button variant="outline" size="sm" :disabled="loading" @click="refresh">
        <RefreshCw class="size-4" :class="loading ? 'animate-spin' : ''" />
        {{ t('common.refresh') }}
      </Button>
    </template>

    <div
      v-if="error"
      class="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
    >
      {{ t('system_status.load_error') }}
    </div>

    <div class="order-2 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card v-for="card in cards" :key="card.label">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground">{{ card.label }}</CardTitle>
          <component :is="card.icon" class="size-4 text-primary" />
        </CardHeader>
        <CardContent>
          <Skeleton v-if="loading && !status" class="h-9 w-24" />
          <div v-else class="flex items-baseline gap-2 text-3xl font-semibold">
            {{ card.value }}
            <span v-if="card.detail" class="text-sm font-normal text-muted-foreground"
              >· {{ card.detail }}</span
            >
          </div>
          <div class="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full bg-primary transition-all"
              :style="{
                width: `${card.label === t('system_status.active_handles') ? 35 : Number.parseInt(card.value) || 0}%`,
              }"
            />
          </div>
        </CardContent>
      </Card>
    </div>

    <div class="order-3 grid items-start gap-4 xl:grid-cols-5">
      <Card class="h-[18rem] max-h-[18rem] overflow-hidden xl:col-span-3">
        <CardHeader class="flex flex-row items-center justify-between"
          ><CardTitle>{{ t('system_status.cpu_cores') }}</CardTitle
          ><span class="text-sm text-muted-foreground"
            >{{ status?.cpu.logicalCores ?? 0 }} {{ t('system_status.logical_cores') }}</span
          ></CardHeader
        >
        <CardContent
          class="grid min-h-0 flex-1 auto-rows-min gap-x-8 gap-y-4 overflow-y-auto pr-2 sm:grid-cols-2"
        >
          <div
            v-for="(usage, index) in status?.cpu.perCorePercent ?? Array(4).fill(0)"
            :key="index"
            class="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-sm"
          >
            <span class="text-muted-foreground">{{
              t('system_status.core', { number: index })
            }}</span
            ><Progress :model-value="usage" /><span class="text-right">{{ usage }}%</span>
          </div>
        </CardContent>
      </Card>

      <Card class="h-[18rem] max-h-[18rem] overflow-hidden xl:col-span-2">
        <CardHeader class="flex flex-row items-center justify-between"
          ><CardTitle>{{ t('system_status.disks') }}</CardTitle
          ><span class="text-sm text-muted-foreground"
            >{{ status?.disks.length ?? 0 }} {{ t('system_status.mounts') }}</span
          ></CardHeader
        >
        <CardContent class="min-h-0 flex-1 space-y-5 overflow-y-auto pr-2">
          <div v-for="item in status?.disks" :key="item.mount" class="space-y-2">
            <div class="flex justify-between text-sm">
              <span class="font-medium">{{ item.mount }}</span
              ><span class="text-muted-foreground"
                >{{ formatBytes(item.usedBytes) }} / {{ formatBytes(item.totalBytes) }} ·
                {{ item.usedPercent }}%</span
              >
            </div>
            <Progress :model-value="item.usedPercent" />
          </div>
          <p v-if="!loading && !status?.disks.length" class="text-sm text-muted-foreground">
            {{ t('system_status.no_disks') }}
          </p>
        </CardContent>
      </Card>
    </div>

    <div class="order-1 rounded-xl border bg-card text-card-foreground shadow-sm">
      <div class="p-3 sm:p-4">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div class="flex min-w-0 items-center gap-3">
              <Server class="size-4 shrink-0 text-primary" />
              <div class="min-w-0">
                <p class="text-xs text-muted-foreground">{{ t('system_status.platform') }}</p>
                <p class="truncate text-sm font-medium">{{ status?.runtime.platform ?? '—' }}</p>
              </div>
            </div>
            <div class="flex min-w-0 items-center gap-3">
              <Terminal class="size-4 shrink-0 text-primary" />
              <div class="min-w-0">
                <p class="text-xs text-muted-foreground">{{ t('system_status.runtime') }}</p>
                <p class="truncate text-sm font-medium">
                  {{ t('system_status.node') }} {{ status?.runtime.nodeVersion ?? '—' }}
                </p>
              </div>
            </div>
            <div class="flex min-w-0 items-center gap-3">
              <Activity class="size-4 shrink-0 text-primary" />
              <div class="min-w-0" :title="status?.runtime.osVersion">
                <p class="text-xs text-muted-foreground">{{ t('system_status.os_version') }}</p>
                <p class="truncate text-sm font-medium">{{ status?.runtime.osVersion ?? '—' }}</p>
              </div>
            </div>
            <div class="flex min-w-0 items-center gap-3">
              <MemoryStick class="size-4 shrink-0 text-primary" />
              <div class="min-w-0">
                <p class="text-xs text-muted-foreground">{{ t('system_status.process_memory') }}</p>
                <p class="truncate text-sm font-medium">
                  {{
                    status
                      ? `${status.runtime.rssMb} MB · ${t('system_status.heap')} ${status.runtime.heapUsedMb}/${status.runtime.heapTotalMb} MB`
                      : '—'
                  }}
                </p>
              </div>
            </div>
            <div class="flex min-w-0 items-center gap-3">
              <Activity class="size-4 shrink-0 text-primary" />
              <div class="min-w-0">
                <p class="text-xs text-muted-foreground">{{ t('system_status.process_uptime') }}</p>
                <p class="truncate text-sm font-medium">
                  {{
                    status
                      ? `${formatUptime(status.runtime.uptimeSeconds)} · ${t('system_status.pid')} ${status.runtime.pid}`
                      : '—'
                  }}
                </p>
              </div>
            </div>
          </div>
          <div
            class="shrink-0 border-t pt-3 text-sm text-muted-foreground lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4"
          >
            <p>{{ t('system_status.auto_refresh', { seconds: 10 }) }}</p>
            <p>
              {{
                t('system_status.last_updated', {
                  time: status?.updatedAt
                    ? new Date(status.updatedAt).toLocaleTimeString()
                    : now.toLocaleTimeString(),
                })
              }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </PageShell>
</template>
