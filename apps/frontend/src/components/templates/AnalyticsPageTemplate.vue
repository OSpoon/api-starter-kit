<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'

defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="flex h-full flex-col gap-6 p-8">
    <PageHeader :title="title" :description="description"><template #actions><slot name="actions" /></template></PageHeader>
    <div v-if="$slots.filters" class="
      flex flex-wrap items-center justify-between gap-3 rounded-lg border
      bg-card p-3
    "><slot name="filters" /></div>
    <div v-if="$slots.metrics" class="
      grid gap-4
      sm:grid-cols-2
      xl:grid-cols-4
    "><slot name="metrics" /></div>
    <slot />
  </div>
</template>
