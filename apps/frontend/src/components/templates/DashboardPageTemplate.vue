<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'

defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="flex h-full flex-col gap-6 p-8">
    <PageHeader :title="title" :description="description">
      <template #actions><slot name="actions" /></template>
    </PageHeader>

    <div v-if="$slots.metrics" class="
      grid gap-4
      sm:grid-cols-2
      xl:grid-cols-4
    ">
      <slot name="metrics" />
    </div>

    <div class="
      grid gap-6
      xl:grid-cols-[minmax(0,1fr)_20rem]
    ">
      <main class="min-w-0"><slot /></main>
      <aside v-if="$slots.aside" class="space-y-6"><slot name="aside" /></aside>
    </div>
  </div>
</template>
