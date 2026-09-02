import { useClipboard } from '@vueuse/core'
import { ref } from 'vue'

export function useCopyText() {
  const source = ref('')
  const clipboard = useClipboard({ source, legacy: true })

  async function copyText(value: string, element?: HTMLElement | null) {
    source.value = value
    const selection = element ? selectText(element) : null
    try {
      await clipboard.copy()
    } finally {
      selection?.removeAllRanges()
    }
  }

  return { ...clipboard, copy: copyText, source }
}

function selectText(element: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return null

  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
  return selection
}
