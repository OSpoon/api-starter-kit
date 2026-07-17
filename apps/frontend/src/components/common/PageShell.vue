<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '@/lib/utils'

import PageHeader from './PageHeader.vue'

const props = defineProps<{
  title: string
  description?: string
  class?: HTMLAttributes['class']
  headerClass?: HTMLAttributes['class']
}>()
</script>

<template>
  <div :class="cn('flex h-full flex-col gap-6 p-8', props.class)">
    <div :class="props.headerClass">
      <PageHeader :title="title" :description="description">
        <template #actions><slot name="actions" /></template>
      </PageHeader>
    </div>
    <slot />
  </div>
</template>
