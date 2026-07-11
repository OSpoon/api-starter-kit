<script setup lang="ts">
import PageShell from '@/components/common/PageShell.vue'

defineProps<{ title: string; description?: string }>()
</script>

<template>
  <PageShell :title="title" :description="description">
    <template #actions><slot name="actions" /></template>
    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <main class="min-w-0 space-y-6"><slot /></main>
      <aside v-if="$slots.aside" class="space-y-6"><slot name="aside" /></aside>
    </div>
  </PageShell>
</template>
