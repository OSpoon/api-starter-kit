<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="
    flex flex-col justify-between gap-4
    sm:flex-row sm:items-start
  ">
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
      <p v-if="description" class="mt-1 max-w-3xl text-sm text-muted-foreground">
        {{ description }}
      </p>
    </div>
    <div v-if="$slots.actions" class="
      flex shrink-0 flex-wrap items-center gap-2
    ">
      <slot name="actions" />
    </div>
  </div>
</template>
