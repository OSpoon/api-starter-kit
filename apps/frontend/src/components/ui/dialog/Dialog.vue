<script setup lang="ts">
import type { DialogRootEmits, DialogRootProps } from 'reka-ui'
import { DialogRoot, useForwardPropsEmits } from 'reka-ui'

import { prepareForModalLayer } from '@/lib/focus'

const props = defineProps<DialogRootProps>()
const emits = defineEmits<DialogRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)

function handleOpenChange(open: boolean) {
  if (open) {
    prepareForModalLayer()
  }

  emits('update:open', open)
}

watch(
  () => props.open,
  (open, previous) => {
    if (open && !previous) {
      prepareForModalLayer()
    }
  },
  { flush: 'sync' }
)
</script>

<template>
  <DialogRoot
    v-slot="slotProps"
    data-slot="dialog"
    v-bind="forwarded"
    @update:open="handleOpenChange"
  >
    <slot v-bind="slotProps" />
  </DialogRoot>
</template>
