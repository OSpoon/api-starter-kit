<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const props = defineProps<{
  title: string
  description?: string
  class?: HTMLAttributes['class']
  preventOpenAutoFocus?: boolean
}>()
</script>

<template>
  <DialogContent
    :class="cn('flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-160', props.class)"
    :prevent-open-auto-focus="preventOpenAutoFocus"
  >
    <DialogHeader class="shrink-0 p-6 pb-2">
      <DialogTitle>{{ title }}</DialogTitle>
      <DialogDescription v-if="description">{{ description }}</DialogDescription>
    </DialogHeader>
    <slot />
  </DialogContent>
</template>
