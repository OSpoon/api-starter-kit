<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="flex items-center justify-between gap-4">
    <div class="min-w-0">
      <div class="font-medium">{{ title }}</div>
      <p v-if="description" class="text-sm text-muted-foreground">{{ description }}</p>
      <slot />
    </div>
    <div v-if="$slots.action" class="shrink-0">
      <slot name="action" />
    </div>
  </div>
</template>
