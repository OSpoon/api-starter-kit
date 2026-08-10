<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    :class="cn('flex flex-wrap items-center justify-between gap-3 border-t p-6 pt-4', props.class)"
  >
    <div class="flex min-w-0 items-center gap-2">
      <slot name="start" />
    </div>
    <div class="flex flex-wrap justify-end gap-2">
      <slot>
        <Button type="button" variant="ghost">
          <slot name="cancel" />
        </Button>
        <Button type="submit">
          <slot name="submit" />
        </Button>
      </slot>
    </div>
  </div>
</template>
