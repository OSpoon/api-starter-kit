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

    <div class="
      grid gap-6
      lg:grid-cols-[minmax(0,1fr)_18rem]
    ">
      <main class="min-w-0 space-y-6"><slot /></main>
      <aside v-if="$slots.aside" class="space-y-4"><slot name="aside" /></aside>
    </div>
  </div>
</template>
