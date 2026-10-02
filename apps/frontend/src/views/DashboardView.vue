<script setup lang="ts">
import {
  BookOpen,
  BrainCircuit,
  FileClock,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from '@lucide/vue'
import type { Component } from 'vue'

import PageShell from '@/components/common/PageShell.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type DashboardOverview, getDashboardOverview } from '@/features/dashboard/api'
import DashboardTrendChart from '@/features/dashboard/components/DashboardTrendChart.vue'
import { usePermission } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

const { t, locale } = useI18n()
const { can } = usePermission()
const auth = useAuthStore()

type MetricKey =
  | 'activeUsers'
  | 'roles'
  | 'activeApiKeys'
  | 'knowledgeDocuments'
  | 'auditEvents'
  | 'aiModelCalls'

const overview = ref<DashboardOverview | null>(null)
const loading = ref(false)
const error = ref(false)

const metricDefinitions: Array<{
  key: MetricKey
  label: string
  permission: string
  icon: Component
}> = [
  {
    key: 'activeUsers',
    label: 'dashboard.metrics.active_users',
    permission: 'users:read',
    icon: UsersRound,
  },
  {
    key: 'roles',
    label: 'dashboard.metrics.roles',
    permission: 'roles:read',
    icon: ShieldCheck,
  },
  {
    key: 'activeApiKeys',
    label: 'dashboard.metrics.active_api_keys',
    permission: 'api-keys:read',
    icon: KeyRound,
  },
  {
    key: 'knowledgeDocuments',
    label: 'dashboard.metrics.knowledge_documents',
    permission: 'knowledge:manage',
    icon: BookOpen,
  },
  {
    key: 'auditEvents',
    label: 'dashboard.metrics.audit_events',
    permission: 'audit-logs:read',
    icon: FileClock,
  },
  {
    key: 'aiModelCalls',
    label: 'dashboard.metrics.ai_model_calls',
    permission: 'system-status:read',
    icon: BrainCircuit,
  },
]

const visibleMetrics = computed(() =>
  metricDefinitions.filter((metric) => {
    if (!can(metric.permission)) return false
    if (error.value && !overview.value) return false
    return !overview.value || overview.value[metric.key] !== null
  })
)

const visibleTrends = computed(() =>
  [
    {
      key: 'auditTrend' as const,
      title: 'dashboard.trends.audit_title',
      description: 'dashboard.trends.audit_description',
      permission: 'audit-logs:read',
      barClass: 'bg-chart-1',
    },
    {
      key: 'aiCallTrend' as const,
      title: 'dashboard.trends.ai_title',
      description: 'dashboard.trends.ai_description',
      permission: 'system-status:read',
      barClass: 'bg-chart-2',
    },
  ].flatMap((trend) => {
    if (!can(trend.permission) || !overview.value) return []
    const points = overview.value[trend.key]
    return points ? [{ ...trend, points }] : []
  })
)

const numberFormatter = computed(() => new Intl.NumberFormat(locale.value))
const lastUpdated = computed(() => {
  if (!overview.value) return ''
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(overview.value.generatedAt))
})

function formatMetric(key: MetricKey) {
  const value = overview.value?.[key]
  return value === null || value === undefined ? '—' : numberFormatter.value.format(value)
}

function formatAiTokens() {
  const value = overview.value?.aiTokensUsed
  return value === null || value === undefined ? '—' : numberFormatter.value.format(value)
}

async function refresh() {
  loading.value = true
  error.value = false
  try {
    overview.value = await getDashboardOverview(auth.token)
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

void refresh()
</script>

<template>
  <PageShell :title="t('dashboard.title')" :description="t('dashboard.desc')" class="gap-6">
    <template #actions>
      <Button variant="outline" size="sm" :disabled="loading" @click="refresh">
        <RefreshCw class="size-4" :class="loading ? 'animate-spin' : ''" aria-hidden="true" />
        {{ t('common.refresh') }}
      </Button>
    </template>

    <section class="space-y-3">
      <p v-if="lastUpdated" class="text-right text-xs text-muted-foreground">
        {{ t('dashboard.last_updated', { time: lastUpdated }) }}
      </p>

      <div
        v-if="error"
        role="alert"
        class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
      >
        <span>{{ t('dashboard.load_error') }}</span>
        <Button variant="outline" size="sm" :disabled="loading" @click="refresh">
          {{ t('dashboard.retry') }}
        </Button>
      </div>

      <div v-if="visibleMetrics.length" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card v-for="metric in visibleMetrics" :key="metric.key" class="h-full">
          <CardHeader class="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              {{ t(metric.label) }}
            </CardTitle>
            <component :is="metric.icon" class="size-4 shrink-0 text-primary" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div
              v-if="loading && !overview"
              class="h-9 w-24 animate-pulse rounded bg-muted"
              aria-hidden="true"
            />
            <template v-else>
              <p class="text-3xl font-semibold tracking-tight tabular-nums">
                {{ formatMetric(metric.key) }}
              </p>
              <p v-if="metric.key === 'aiModelCalls'" class="mt-1 text-xs text-muted-foreground">
                {{ t('dashboard.metrics.ai_tokens_used', { count: formatAiTokens() }) }}
              </p>
            </template>
          </CardContent>
        </Card>
      </div>
      <p
        v-else-if="!loading && !error"
        class="rounded-lg border border-dashed p-5 text-sm text-muted-foreground"
      >
        {{ t('dashboard.no_metrics') }}
      </p>
    </section>

    <section v-if="visibleTrends.length" class="space-y-4">
      <h2 class="text-lg font-semibold tracking-tight">{{ t('dashboard.trends.title') }}</h2>
      <div class="grid items-start gap-4 xl:grid-cols-2">
        <DashboardTrendChart
          v-for="trend in visibleTrends"
          :key="trend.key"
          :title="t(trend.title)"
          :description="t(trend.description)"
          :points="trend.points"
          :locale="locale"
          :bar-class="trend.barClass"
        />
      </div>
    </section>
  </PageShell>
</template>
