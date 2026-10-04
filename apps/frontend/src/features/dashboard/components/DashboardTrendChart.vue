<script setup lang="ts">
import { computed } from 'vue'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { DashboardTrendPoint } from '@/features/dashboard/api'

const props = defineProps<{
  title: string
  description: string
  points: DashboardTrendPoint[]
  locale: string
  lineClass: string
}>()

const maxCount = computed(() => Math.max(0, ...props.points.map((point) => point.count)))
const numberFormatter = computed(() => new Intl.NumberFormat(props.locale))
const dayFormatter = computed(
  () => new Intl.DateTimeFormat(props.locale, { month: 'numeric', day: 'numeric' })
)
const chartPoints = computed(() =>
  props.points.map((point, index) => {
    const date = new Date(`${point.date}T12:00:00`)
    const ratio = maxCount.value === 0 ? 0 : point.count / maxCount.value

    return {
      date: point.date,
      dateLabel: dayFormatter.value.format(date),
      countLabel: numberFormatter.value.format(point.count),
      x: ((index + 0.5) / props.points.length) * 100,
      y: 124 - ratio * 120,
    }
  })
)
const linePoints = computed(() =>
  chartPoints.value.map((point) => `${point.x},${point.y}`).join(' ')
)
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ title }}</CardTitle>
      <CardDescription>{{ description }}</CardDescription>
    </CardHeader>
    <CardContent>
      <ul class="sr-only" :aria-label="title">
        <li v-for="point in chartPoints" :key="point.date">
          {{ point.dateLabel }}: {{ point.countLabel }}
        </li>
      </ul>
      <div aria-hidden="true" class="space-y-2">
        <div class="grid grid-cols-7 text-center text-xs text-muted-foreground tabular-nums">
          <span v-for="point in chartPoints" :key="point.date">{{ point.countLabel }}</span>
        </div>
        <div class="relative h-32 border-b border-border" :class="lineClass">
          <svg class="size-full" viewBox="0 0 100 128" preserveAspectRatio="none">
            <polyline
              :points="linePoints"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <span
            v-for="point in chartPoints"
            :key="point.date"
            class="absolute size-2 -translate-1/2 rounded-full bg-current"
            :style="{ left: `${point.x}%`, top: `${(point.y / 128) * 100}%` }"
          />
        </div>
        <div class="grid grid-cols-7 text-center text-xs text-muted-foreground">
          <span v-for="point in chartPoints" :key="point.date">{{ point.dateLabel }}</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
