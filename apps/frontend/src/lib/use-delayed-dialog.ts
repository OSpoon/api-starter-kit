import { useTimeoutFn } from '@vueuse/core'

const DEFAULT_UNMOUNT_DELAY_MS = 200

export function useDelayedDialog(delayMs = DEFAULT_UNMOUNT_DELAY_MS) {
  const open = ref(false)
  const mounted = ref(false)
  const unmountTimeout = useTimeoutFn(
    () => {
      if (!open.value) mounted.value = false
    },
    delayMs,
    { immediate: false }
  )

  function show() {
    unmountTimeout.stop()
    mounted.value = true
    open.value = true
  }

  function close() {
    onOpenChange(false)
  }

  function onOpenChange(value: boolean) {
    open.value = value
    unmountTimeout.stop()

    if (!value) unmountTimeout.start()
  }

  return {
    open,
    mounted,
    show,
    close,
    onOpenChange,
  }
}
