<script setup lang="ts">
import PageShell from '@/components/common/PageShell.vue'

defineProps<{ title: string; description?: string }>()
</script>

<template>
  <PageShell :title="title" :description="description">
    <div class="mx-auto grid w-full max-w-3xl gap-6">
      <slot name="steps" />
      <main class="rounded-lg border bg-card p-6"><slot /></main>
    </div>
  </PageShell>
</template>
