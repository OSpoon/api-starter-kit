import { useEventListener } from '@vueuse/core'

export function useAiChatResize() {
  const chatHeight = ref(600)
  const chatWidth = ref(520)
  const isResizing = ref(false)
  const resizeStartX = ref(0)
  const resizeStartY = ref(0)
  const resizeStartWidth = ref(0)
  const resizeStartHeight = ref(0)

  function stopResize() {
    isResizing.value = false
    document.body.style.userSelect = ''
  }

  function onResize(event: MouseEvent) {
    if (!isResizing.value) return

    const deltaY = resizeStartY.value - event.clientY
    chatHeight.value = Math.min(
      Math.max(resizeStartHeight.value + deltaY, 420),
      window.innerHeight - 32
    )

    const deltaX = resizeStartX.value - event.clientX
    chatWidth.value = Math.min(
      Math.max(resizeStartWidth.value + deltaX, 360),
      window.innerWidth - 32
    )
  }

  function startResize(event: MouseEvent) {
    isResizing.value = true
    resizeStartX.value = event.clientX
    resizeStartY.value = event.clientY
    resizeStartWidth.value = chatWidth.value
    resizeStartHeight.value = chatHeight.value
    document.body.style.userSelect = 'none'
  }

  useEventListener('mousemove', onResize)
  useEventListener('mouseup', stopResize)
  tryOnUnmounted(stopResize)

  return { chatHeight, chatWidth, startResize, stopResize }
}
