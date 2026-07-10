<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'

defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="flex h-full flex-col gap-6 p-8">
    <PageHeader :title="title" :description="description" />
    <div class="mx-auto grid w-full max-w-3xl gap-6"><slot name="steps" /><main class="
      rounded-lg border bg-card p-6
    "><slot /></main></div>
  </div>
</template>
