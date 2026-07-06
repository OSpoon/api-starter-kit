<script setup lang="ts">
import { XIcon } from '@lucide/vue'

import type { DialogContentEmits, DialogContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { provide, ref } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { DialogClose, DialogContent, DialogPortal, useForwardPropsEmits } from 'reka-ui'
import { dialogContainerRefKey, insideDialogKey } from '@/lib/dialog-context'
import { prepareForModalLayer, focusElement } from '@/lib/focus'
import { resolveComponentElement } from '@/lib/overlay-portal'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import DialogOverlay from './DialogOverlay.vue'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<
    DialogContentProps & {
      class?: HTMLAttributes['class']
      showCloseButton?: boolean
      preventOpenAutoFocus?: boolean
    }
  >(),
  {
    showCloseButton: true,
    preventOpenAutoFocus: false,
  }
)
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'showCloseButton', 'preventOpenAutoFocus')

const forwarded = useForwardPropsEmits(delegatedProps, emits)

const dialogContainerRef = ref<HTMLElement | null>(null)

provide(insideDialogKey, true)
provide(dialogContainerRefKey, dialogContainerRef)

function setDialogContainer(instance: unknown) {
  dialogContainerRef.value = resolveComponentElement(instance)
}

function handleOpenAutoFocus(event: Event) {
  prepareForModalLayer()
  event.preventDefault()
  focusElement(event.currentTarget)
}

function handleCloseAutoFocus(event: Event) {
  event.preventDefault()
  prepareForModalLayer()
}
</script>

<template>
  <DialogPortal>
    <DialogOverlay />
    <DialogContent
      :ref="setDialogContainer"
      data-slot="dialog-content"
      v-bind="{ ...$attrs, ...forwarded }"
      tabindex="-1"
      :class="
        cn(
          'bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ring-foreground/10 grid max-w-[calc(100%-2rem)] gap-6 overflow-hidden rounded-xl p-6 text-sm ring-1 duration-100 sm:max-w-md fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none',
          props.class
        )
      "
      @open-auto-focus="handleOpenAutoFocus"
      @close-auto-focus="handleCloseAutoFocus"
    >
      <slot />

      <DialogClose v-if="showCloseButton" data-slot="dialog-close" as-child>
        <Button variant="ghost" class="absolute top-4 right-4" size="icon-sm">
          <XIcon />
          <span class="sr-only">Close</span>
        </Button>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
