<script setup lang="ts">
import { BookOpen, BrainCircuit, RefreshCw, UsersRound } from '@lucide/vue'
import type { Component } from 'vue'

import PageShell from '@/components/common/PageShell.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
}> = [
  {
    key: 'activeUsers',
    label: 'dashboard.metrics.active_users',
    permission: 'users:read',
  },
  {
    key: 'roles',
    label: 'dashboard.metrics.roles',
    permission: 'roles:read',
  },
  {
    key: 'activeApiKeys',
    label: 'dashboard.metrics.active_api_keys',
    permission: 'api-keys:read',
  },
  {
    key: 'knowledgeDocuments',
    label: 'dashboard.metrics.knowledge_documents',
    permission: 'knowledge:manage',
  },
  {
    key: 'auditEvents',
    label: 'dashboard.metrics.audit_events',
    permission: 'audit-logs:read',
  },
  {
    key: 'aiModelCalls',
    label: 'dashboard.metrics.ai_model_calls',
    permission: 'system-status:read',
  },
]

const visibleMetrics = computed(() =>
  metricDefinitions.filter((metric) => {
    if (!can(metric.permission)) return false
    if (error.value && !overview.value) return false
    return !overview.value || overview.value[metric.key] !== null
  })
)

const metricGroups: Array<{
  key: string
  title: string
  icon: Component
  metricKeys: MetricKey[]
  highlighted: boolean
}> = [
  {
    key: 'access',
    title: 'dashboard.groups.access',
    icon: UsersRound,
    metricKeys: ['activeUsers', 'roles'],
    highlighted: false,
  },
  {
    key: 'resources',
    title: 'dashboard.groups.resources',
    icon: BookOpen,
    metricKeys: ['activeApiKeys', 'knowledgeDocuments'],
    highlighted: false,
  },
  {
    key: 'activity',
    title: 'dashboard.groups.activity',
    icon: BrainCircuit,
    metricKeys: ['auditEvents', 'aiModelCalls'],
    highlighted: true,
  },
]

const visibleMetricGroups = computed(() =>
  metricGroups.flatMap((group) => {
    const metrics = visibleMetrics.value.filter((metric) => group.metricKeys.includes(metric.key))
    return metrics.length ? [{ ...group, metrics }] : []
  })
)

const visibleTrends = computed(() =>
  [
    {
      key: 'auditTrend' as const,
      title: 'dashboard.trends.audit_title',
      description: 'dashboard.trends.audit_description',
      permission: 'audit-logs:read',
      lineClass: 'text-chart-1',
    },
    {
      key: 'aiCallTrend' as const,
      title: 'dashboard.trends.ai_title',
      description: 'dashboard.trends.ai_description',
      permission: 'system-status:read',
      lineClass: 'text-chart-2',
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

      <div v-if="visibleMetricGroups.length" class="grid items-stretch gap-3 lg:grid-cols-3">
        <Card
          v-for="group in visibleMetricGroups"
          :key="group.key"
          class="gap-2 py-3 shadow-none lg:gap-3 lg:py-4"
          :class="group.highlighted ? 'border-chart-1/20 bg-chart-1/5' : 'border-border/70'"
        >
          <CardHeader class="flex flex-row items-center justify-between gap-3 px-5">
            <CardTitle class="font-sans text-xs font-medium text-muted-foreground">
              {{ t(group.title) }}
            </CardTitle>
            <component
              :is="group.icon"
              class="size-4 shrink-0"
              :class="group.highlighted ? 'text-chart-1' : 'text-muted-foreground/70'"
              aria-hidden="true"
            />
          </CardHeader>
          <CardContent class="px-5">
            <dl class="grid grid-cols-2 items-start gap-4">
              <div v-for="metric in group.metrics" :key="metric.key" class="min-w-0">
                <dt class="text-xs text-muted-foreground">{{ t(metric.label) }}</dt>
                <dd class="mt-1">
                  <Skeleton v-if="loading && !overview" class="h-9 w-16" />
                  <template v-else>
                    <p
                      class="text-2xl leading-tight font-semibold tracking-tight break-all tabular-nums lg:text-3xl"
                      :class="group.highlighted ? 'text-chart-1' : ''"
                    >
                      {{ formatMetric(metric.key) }}
                    </p>
                    <p
                      v-if="metric.key === 'aiModelCalls'"
                      class="mt-1 text-[11px] break-words text-muted-foreground"
                    >
                      {{ t('dashboard.metrics.ai_tokens_used', { count: formatAiTokens() }) }}
                    </p>
                  </template>
                </dd>
              </div>
            </dl>
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
          :line-class="trend.lineClass"
        />
      </div>
    </section>
  </PageShell>
</template>
