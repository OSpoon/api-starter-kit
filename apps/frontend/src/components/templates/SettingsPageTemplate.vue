<script setup lang="ts">
import PageShell from '@/components/common/PageShell.vue'

defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <PageShell :title="title" :description="description">
    <template #actions><slot name="actions" /></template>
    <div class="grid gap-6 lg:grid-cols-[14rem_minmax(0,42rem)]">
      <nav v-if="$slots.navigation" class="lg:sticky lg:top-6 lg:h-fit">
        <slot name="navigation" />
      </nav>
      <main class="min-w-0 space-y-6"><slot /></main>
    </div>
  </PageShell>
</template>
