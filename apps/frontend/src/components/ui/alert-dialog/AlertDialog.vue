<script setup lang="ts">
import type { AlertDialogEmits, AlertDialogProps } from 'reka-ui'
import { AlertDialogRoot, useForwardPropsEmits } from 'reka-ui'
import { watch } from 'vue'

import { prepareForModalLayer } from '@/lib/focus'

const props = defineProps<AlertDialogProps>()
const emits = defineEmits<AlertDialogEmits>()

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
  <AlertDialogRoot
    v-slot="slotProps"
    data-slot="alert-dialog"
    v-bind="forwarded"
    @update:open="handleOpenChange"
  >
    <slot v-bind="slotProps" />
  </AlertDialogRoot>
</template>
