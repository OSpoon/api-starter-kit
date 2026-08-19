import { computed, type ComputedRef, ref } from 'vue'

import type { DisplayAiChatMessage } from '../types'

export function useAiChatMessageSelection(messages: ComputedRef<DisplayAiChatMessage[]>) {
  const isSelecting = ref(false)
  const selectedKeys = ref(new Set<string>())

  function getMessageKey(message: DisplayAiChatMessage, index: number) {
    return `${message.id ?? 'message'}-${index}`
  }

  const selectableCount = computed(
    () =>
      messages.value.filter((message) => message.id !== 'welcome' && message.content.trim()).length
  )

  const selectedMessages = computed(() =>
    messages.value.filter((message, index) => selectedKeys.value.has(getMessageKey(message, index)))
  )

  function start() {
    isSelecting.value = true
    selectedKeys.value = new Set()
  }

  function cancel() {
    isSelecting.value = false
    selectedKeys.value = new Set()
  }

  function select(message: DisplayAiChatMessage, index: number, selected: boolean) {
    const key = getMessageKey(message, index)
    const nextSelection = new Set(selectedKeys.value)
    if (selected) nextSelection.add(key)
    else nextSelection.delete(key)
    selectedKeys.value = nextSelection
  }

  function toggleAll(selected: boolean) {
    selectedKeys.value = selected
      ? new Set(
          messages.value.flatMap((message, index) =>
            message.id !== 'welcome' && message.content.trim()
              ? [getMessageKey(message, index)]
              : []
          )
        )
      : new Set()
  }

  function prune() {
    const availableKeys = new Set(messages.value.map(getMessageKey))
    selectedKeys.value = new Set([...selectedKeys.value].filter((key) => availableKeys.has(key)))
  }

  return {
    isSelecting,
    selectedKeys,
    selectableCount,
    selectedMessages,
    getMessageKey,
    start,
    cancel,
    select,
    toggleAll,
    prune,
  }
}
