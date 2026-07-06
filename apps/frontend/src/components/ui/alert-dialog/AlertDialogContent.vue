<script setup lang="ts">
import type { AlertDialogContentEmits, AlertDialogContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { provide, ref } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import {
  AlertDialogContent,
  AlertDialogOverlay,
  AlertDialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { dialogContainerRefKey, insideDialogKey } from '@/lib/dialog-context'
import { cn } from '@/lib/utils'
import { prepareForModalLayer } from '@/lib/focus'
import { resolveComponentElement } from '@/lib/overlay-portal'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<
    AlertDialogContentProps & {
      class?: HTMLAttributes['class']
      size?: 'default' | 'sm'
    }
  >(),
  {
    size: 'default',
  }
)
const emits = defineEmits<AlertDialogContentEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'size')

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
  const target = event.currentTarget
  if (target instanceof HTMLElement) {
    target.focus({ preventScroll: true })
  }
}

function handleCloseAutoFocus(event: Event) {
  event.preventDefault()
  prepareForModalLayer()
}
</script>

<template>
  <AlertDialogPortal>
    <AlertDialogOverlay
      data-slot="alert-dialog-overlay"
      class="data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 z-50"
    />
    <AlertDialogContent
      :ref="setDialogContainer"
      data-slot="alert-dialog-content"
      :data-size="size"
      v-bind="{ ...$attrs, ...forwarded }"
      tabindex="-1"
      :class="
        cn(
          'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 bg-popover text-popover-foreground ring-foreground/10 gap-6 rounded-xl p-6 ring-1 duration-100 data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-lg group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 outline-none',
          props.class
        )
      "
      @open-auto-focus="handleOpenAutoFocus"
      @close-auto-focus="handleCloseAutoFocus"
    >
      <slot />
    </AlertDialogContent>
  </AlertDialogPortal>
</template>
