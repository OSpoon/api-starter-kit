<script setup lang="ts">
import PageShell from '@/components/common/PageShell.vue'

defineProps<{ title: string; description?: string }>()
</script>

<template>
  <PageShell :title="title" :description="description">
    <template #actions><slot name="actions" /></template>
    <div
      v-if="$slots.filters"
      class="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3"
    >
      <slot name="filters" />
    </div>
    <div v-if="$slots.metrics" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <slot name="metrics" />
    </div>
    <slot />
  </PageShell>
</template>
