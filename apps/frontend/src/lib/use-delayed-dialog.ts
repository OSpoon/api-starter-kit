const DEFAULT_UNMOUNT_DELAY_MS = 200

export function useDelayedDialog(delayMs = DEFAULT_UNMOUNT_DELAY_MS) {
  const open = ref(false)
  const mounted = ref(false)
  let unmountTimer: ReturnType<typeof setTimeout> | undefined

  function clearUnmountTimer() {
    if (unmountTimer !== undefined) {
      clearTimeout(unmountTimer)
      unmountTimer = undefined
    }
  }

  function show() {
    clearUnmountTimer()
    mounted.value = true
    open.value = true
  }

  function close() {
    onOpenChange(false)
  }

  function onOpenChange(value: boolean) {
    open.value = value
    clearUnmountTimer()

    if (!value) {
      unmountTimer = setTimeout(() => {
        if (!open.value) {
          mounted.value = false
        }
        unmountTimer = undefined
      }, delayMs)
    }
  }

  return {
    open,
    mounted,
    show,
    close,
    onOpenChange,
  }
}
