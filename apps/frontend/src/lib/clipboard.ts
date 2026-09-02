import { useClipboard } from '@vueuse/core'

export function useCopyText() {
  return useClipboard({ legacy: true })
}
