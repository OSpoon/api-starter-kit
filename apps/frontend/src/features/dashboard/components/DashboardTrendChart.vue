<script setup lang="ts">
import { computed } from 'vue'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { DashboardTrendPoint } from '@/features/dashboard/api'

const props = defineProps<{
  title: string
  description: string
  points: DashboardTrendPoint[]
  locale: string
  barClass: string
}>()

const maxCount = computed(() => Math.max(0, ...props.points.map((point) => point.count)))
const numberFormatter = computed(() => new Intl.NumberFormat(props.locale))
const dayFormatter = computed(
  () => new Intl.DateTimeFormat(props.locale, { month: 'numeric', day: 'numeric' })
)
const bars = computed(() =>
  props.points.map((point) => {
    const date = new Date(`${point.date}T12:00:00`)
    const height = maxCount.value === 0 ? 0 : Math.max(4, (point.count / maxCount.value) * 100)

    return {
      dateLabel: dayFormatter.value.format(date),
      countLabel: numberFormatter.value.format(point.count),
      height: `${height}%`,
    }
  })
)
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ title }}</CardTitle>
      <CardDescription>{{ description }}</CardDescription>
    </CardHeader>
    <CardContent>
      <div role="list" :aria-label="title" class="grid grid-cols-7 gap-2 sm:gap-4">
        <div
          v-for="(bar, index) in bars"
          :key="points[index]?.date"
          role="listitem"
          class="flex min-w-0 flex-col items-center gap-2"
        >
          <span class="text-xs text-muted-foreground tabular-nums">{{ bar.countLabel }}</span>
          <div class="flex h-32 w-full items-end border-b border-border">
            <div
              class="w-full rounded-t-sm transition-[height]"
              :class="barClass"
              :style="{ height: bar.height }"
              aria-hidden="true"
            />
          </div>
          <span class="text-xs text-muted-foreground">{{ bar.dateLabel }}</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
