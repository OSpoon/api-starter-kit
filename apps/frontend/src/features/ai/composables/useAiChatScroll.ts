import { nextTick, onUnmounted, type Ref, ref } from 'vue'

export function useAiChatScroll(
  scrollAreaRef: Ref<{ $el?: HTMLElement } | null>,
  isOpen: Ref<boolean>
) {
  const autoScrollEnabled = ref(true)
  let scrollViewport: HTMLElement | null = null

  function getScrollViewport() {
    return (
      scrollAreaRef.value?.$el?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ??
      null
    )
  }

  function isNearBottom(viewport: HTMLElement) {
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 32
  }

  function handleScroll() {
    if (scrollViewport) autoScrollEnabled.value = isNearBottom(scrollViewport)
  }

  function bindViewport() {
    const viewport = getScrollViewport()
    if (viewport === scrollViewport) return viewport

    scrollViewport?.removeEventListener('scroll', handleScroll)
    scrollViewport = viewport
    scrollViewport?.addEventListener('scroll', handleScroll, { passive: true })
    if (scrollViewport) autoScrollEnabled.value = isNearBottom(scrollViewport)
    return scrollViewport
  }

  function scrollToBottom(force = false) {
    if (!force && !autoScrollEnabled.value) return
    if (force) autoScrollEnabled.value = true

    nextTick(() => {
      const viewport = bindViewport()
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight
        autoScrollEnabled.value = true
      }
    })
  }

  function detach() {
    scrollViewport?.removeEventListener('scroll', handleScroll)
    scrollViewport = null
  }

  watch(isOpen, (value) => {
    if (!value) detach()
    else scrollToBottom(true)
  })

  onUnmounted(detach)

  return { autoScrollEnabled, scrollToBottom, detach }
}
