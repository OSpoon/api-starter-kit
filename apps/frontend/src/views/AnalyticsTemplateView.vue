<script setup lang="ts">
import { Download, RefreshCw } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { toast } from 'vue-sonner'

import DataTable from '@/components/common/DataTable.vue'
import AnalyticsPageTemplate from '@/components/templates/AnalyticsPageTemplate.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

type EndpointMetric = { endpoint: string; requests: string; successRate: string; usage: number }

const { t } = useI18n()
const range = ref('analytics.range_7_days')
const loading = ref(false)
const endpointMetrics: EndpointMetric[] = [
  { endpoint: '/v1/users', requests: '24,680', successRate: '99.9%', usage: 68 },
  { endpoint: '/v1/api-keys', requests: '24,680', successRate: '99.9%', usage: 68 },
  { endpoint: '/v1/ai-chat', requests: '24,680', successRate: '99.9%', usage: 68 },
]
const ranges = ['analytics.range_7_days', 'analytics.range_30_days', 'analytics.range_quarter']
const metrics = computed(() => [
  { label: t('analytics.requests'), value: '128.4k' },
  { label: t('analytics.success_rate'), value: '99.98%' },
  { label: t('analytics.response_time'), value: '182ms' },
  { label: t('analytics.active_keys'), value: '24' },
])
const columns = computed<ColumnDef<EndpointMetric>[]>(() => [
  {
    accessorKey: 'endpoint',
    meta: { label: t('analytics.endpoint') },
    header: () => t('analytics.endpoint'),
    cell: ({ row }) => h('code', { class: 'font-mono text-sm' }, row.original.endpoint),
  },
  {
    accessorKey: 'requests',
    meta: { label: t('analytics.requests') },
    header: () => t('analytics.requests'),
  },
  {
    accessorKey: 'successRate',
    meta: { label: t('analytics.success_rate') },
    header: () => t('analytics.success_rate'),
  },
  {
    accessorKey: 'usage',
    meta: { label: t('analytics.usage') },
    header: () => t('analytics.usage'),
    cell: ({ row }) => h(Progress, { modelValue: row.original.usage }),
  },
])

async function refresh() {
  loading.value = true
  await new Promise((resolve) => setTimeout(resolve, 500))
  loading.value = false
  toast.success(t('analytics.refreshed'))
}
</script>

<template>
  <AnalyticsPageTemplate :title="t('analytics.title')" :description="t('analytics.description')">
    <template #actions>
      <Button variant="outline" size="sm" @click="toast.success(t('analytics.exported'))"
        ><Download class="size-4" />{{ t('analytics.export') }}</Button
      >
      <Button size="sm" :disabled="loading" @click="refresh"
        ><RefreshCw class="size-4" :class="loading ? 'animate-spin' : ''" />{{
          t('analytics.refresh')
        }}</Button
      >
    </template>
    <template #filters>
      <div class="flex gap-2">
        <Button
          v-for="option in ranges"
          :key="option"
          size="sm"
          :variant="range === option ? 'secondary' : 'ghost'"
          @click="range = option"
          >{{ t(option) }}</Button
        >
      </div>
      <span class="text-sm text-muted-foreground">{{
        t('analytics.range_current', { range: t(range) })
      }}</span>
    </template>
    <template #metrics>
      <Card v-for="item in metrics" :key="item.label"
        ><CardHeader class="pb-2"
          ><CardDescription>{{ item.label }}</CardDescription></CardHeader
        ><CardContent
          ><Skeleton v-if="loading" class="h-8 w-20" />
          <div v-else class="text-2xl font-semibold">{{ item.value }}</div></CardContent
        ></Card
      >
    </template>
    <Card
      ><CardHeader
        ><CardTitle>{{ t('analytics.endpoint_performance') }}</CardTitle
        ><CardDescription>{{
          t('analytics.endpoint_performance_description')
        }}</CardDescription></CardHeader
      ><CardContent
        ><DataTable
          :columns="columns"
          :data="endpointMetrics"
          :empty-message="t('analytics.no_endpoint_data')" /></CardContent
    ></Card>
  </AnalyticsPageTemplate>
</template>
