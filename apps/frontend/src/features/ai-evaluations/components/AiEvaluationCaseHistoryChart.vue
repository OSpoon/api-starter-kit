<script setup lang="ts">
import type { AiEvaluationCaseHistoryItem } from '@/features/ai-evaluations/api'

const props = defineProps<{
  items: AiEvaluationCaseHistoryItem[]
  selectedRunId: number | null
  locale: string
}>()

const emit = defineEmits<{
  select: [item: AiEvaluationCaseHistoryItem]
}>()

const hoveredRunId = ref<number | null>(null)
const dateFormatter = computed(
  () =>
    new Intl.DateTimeFormat(props.locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
)
const points = computed(() =>
  [...props.items].reverse().map((item, index, entries) => ({
    item,
    x: entries.length === 1 ? 50 : 4 + (index / (entries.length - 1)) * 92,
    y: 90 - (item.result.score / 100) * 80,
    dateLabel: dateFormatter.value.format(new Date(item.createdAt)),
  }))
)
const linePoints = computed(() => points.value.map(({ x, y }) => `${x},${y}`).join(' '))
const hoveredPoint = computed(
  () => points.value.find(({ item }) => item.runId === hoveredRunId.value) ?? null
)

function setHovered(runId: number | null) {
  hoveredRunId.value = runId
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-stretch gap-3">
      <div
        aria-hidden="true"
        class="flex h-32 shrink-0 flex-col justify-between py-1 text-xs text-muted-foreground tabular-nums"
      >
        <span>100%</span>
        <span>50%</span>
        <span>0%</span>
      </div>
      <div class="relative h-32 min-w-0 flex-1">
        <svg
          aria-hidden="true"
          class="absolute inset-0 size-full overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <line
            v-for="y in [10, 50, 90]"
            :key="y"
            x1="0"
            :y1="y"
            x2="100"
            :y2="y"
            class="stroke-border"
            stroke-width="0.5"
            vector-effect="non-scaling-stroke"
          />
          <polyline
            v-if="points.length > 1"
            :points="linePoints"
            fill="none"
            class="stroke-primary"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <button
          v-for="point in points"
          :key="point.item.runId"
          type="button"
          class="absolute z-10 grid size-5 -translate-1/2 place-items-center rounded-full transition outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          :class="
            selectedRunId === point.item.runId || hoveredRunId === point.item.runId
              ? 'bg-primary/15'
              : 'hover:bg-primary/10'
          "
          :style="{ left: `${point.x}%`, top: `${point.y}%` }"
          :aria-label="`${point.dateLabel}, ${point.item.result.score}%`"
          :aria-pressed="selectedRunId === point.item.runId"
          :title="`${point.dateLabel} · ${point.item.result.score}%`"
          @click="emit('select', point.item)"
          @mouseenter="setHovered(point.item.runId)"
          @mouseleave="setHovered(null)"
          @focus="setHovered(point.item.runId)"
          @blur="setHovered(null)"
        >
          <span
            class="size-2.5 rounded-full border border-background shadow-sm"
            :class="
              selectedRunId === point.item.runId || hoveredRunId === point.item.runId
                ? 'bg-primary ring-2 ring-primary/30'
                : 'bg-primary'
            "
          />
        </button>
        <div
          v-if="hoveredPoint"
          class="pointer-events-none absolute z-20 w-64 -translate-x-1/2 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
          :style="{
            left: `${Math.min(63, Math.max(37, hoveredPoint.x))}%`,
            top: `${Math.min(65, hoveredPoint.y + 6)}%`,
          }"
        >
          <p class="text-xs font-medium">
            {{ hoveredPoint.dateLabel }} · {{ hoveredPoint.item.result.score }}%
          </p>
          <p class="mt-1 line-clamp-3 text-xs text-muted-foreground">
            {{ hoveredPoint.item.result.actualAnswer || hoveredPoint.item.result.error }}
          </p>
        </div>
      </div>
    </div>
    <div class="ml-10 flex justify-between text-xs text-muted-foreground">
      <span>{{ points[0]?.dateLabel }}</span>
      <span v-if="points.length > 1">{{ points.at(-1)?.dateLabel }}</span>
    </div>
    <ul class="sr-only">
      <li v-for="point in points" :key="point.item.runId">
        {{ point.dateLabel }}: {{ point.item.result.score }}%
      </li>
    </ul>
  </div>
</template>
