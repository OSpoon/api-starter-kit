<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '@/lib/utils'

import PageHeader from './PageHeader.vue'

const props = defineProps<{
  title: string
  description?: string
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div :class="cn('flex h-full flex-col gap-6 p-8', props.class)">
    <PageHeader :title="title" :description="description">
      <template #actions><slot name="actions" /></template>
    </PageHeader>
    <slot />
  </div>
</template>
