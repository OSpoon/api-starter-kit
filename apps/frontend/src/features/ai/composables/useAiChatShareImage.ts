import { useTimeoutFn } from '@vueuse/core'
import { nextTick, onScopeDispose, ref } from 'vue'
import { toast } from 'vue-sonner'

export function useAiChatShareImage() {
  const { t } = useI18n()
  const isGenerating = ref(false)
  let imageUrl = ''
  const revokeImageUrl = useTimeoutFn(
    () => {
      if (!imageUrl) return
      URL.revokeObjectURL(imageUrl)
      imageUrl = ''
    },
    1000,
    { immediate: false }
  )

  onScopeDispose(() => {
    revokeImageUrl.stop()
    if (imageUrl) URL.revokeObjectURL(imageUrl)
  })

  async function generate(getImageElement: () => HTMLElement | null) {
    if (isGenerating.value) return false
    isGenerating.value = true

    try {
      await nextTick()
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      await nextTick()
      await document.fonts.ready
      const imageElement = getImageElement()
      if (!imageElement) throw new Error('Image content is unavailable')

      // shortcut: long selections can exceed browser canvas limits; split images if larger exports are needed.
      const { toBlob } = await import('html-to-image')
      const blob = await toBlob(imageElement, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        style: { position: 'static', left: 'auto', top: 'auto', opacity: '1', zIndex: 'auto' },
      })
      if (!blob) throw new Error('Image rendering failed')

      revokeImageUrl.stop()
      if (imageUrl) URL.revokeObjectURL(imageUrl)
      imageUrl = URL.createObjectURL(blob)
      revokeImageUrl.start()
      const link = document.createElement('a')
      link.href = imageUrl
      link.download = `ai-chat-${Date.now()}.png`
      document.body.append(link)
      link.click()
      link.remove()
      toast.success(t('ai_chat.share_image_success'))
      return true
    } catch {
      toast.error(t('ai_chat.share_image_failed'))
      return false
    } finally {
      isGenerating.value = false
    }
  }

  return { isGenerating, generate }
}
