import type { Ref } from 'vue'
import { toast } from 'vue-sonner'

import {
  type AiChatConfirmation,
  type AiChatConversation,
  type AiChatConversationSummary,
  type AiChatMessage,
  type AiChatRunMeta,
  createAiChatConversation,
  deleteAiChatConversation,
  getAiChatConversation,
  listAiChatConversations,
} from '../api'
import { hasAiChatConversationContent } from '../conversation-state'
import type { LocalAiChatMessage } from '../types'

export type AiChatConversationState = {
  loading: Ref<boolean>
  conversation: Ref<AiChatConversation | null>
  conversations: Ref<AiChatConversationSummary[]>
  streamingMessages: Ref<Array<AiChatMessage | LocalAiChatMessage>>
  streamingMessageId: Ref<string | number | null>
  abortController: Ref<AbortController | null>
  confirmations: Ref<AiChatConfirmation[]>
  pendingConfirmation: Ref<AiChatConfirmation | null>
  approvalDismissed: Ref<boolean>
  runMeta: Ref<AiChatRunMeta | null>
}

export function useAiChatConversations(
  token: Ref<string | null> | (() => string | null),
  translate: (key: string) => string,
  state: AiChatConversationState,
  presentLatestConfirmation: (confirmations: AiChatConfirmation[]) => void
) {
  const getToken = () => (typeof token === 'function' ? token() : token.value)

  async function refresh() {
    state.conversations.value = await listAiChatConversations(getToken())
  }

  async function ensure() {
    if (state.conversation.value) return state.conversation.value

    const conversation = await createAiChatConversation(getToken())
    state.conversation.value = conversation
    await refresh()
    return conversation
  }

  function resetCurrentConversation() {
    state.abortController.value?.abort()
    state.abortController.value = null
    state.streamingMessages.value = []
    state.streamingMessageId.value = null
    state.confirmations.value = []
    state.pendingConfirmation.value = null
    state.approvalDismissed.value = false
    state.runMeta.value = null
  }

  async function createNew() {
    const shouldReuseEmptyConversation =
      state.conversation.value &&
      !hasAiChatConversationContent(state.conversation.value.messages) &&
      !hasAiChatConversationContent(state.streamingMessages.value)

    resetCurrentConversation()
    if (shouldReuseEmptyConversation) return

    state.conversation.value = await createAiChatConversation(getToken())
    await refresh()
  }

  async function select(id: string | number) {
    state.loading.value = true
    try {
      resetCurrentConversation()
      state.conversation.value = await getAiChatConversation(getToken(), Number(id))
      state.confirmations.value = state.conversation.value.confirmations ?? []
      presentLatestConfirmation(state.confirmations.value)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : translate('common.error'))
    } finally {
      state.loading.value = false
    }
  }

  async function remove(id: string | number) {
    state.loading.value = true
    try {
      const removingCurrent = state.conversation.value?.id === Number(id)
      await deleteAiChatConversation(getToken(), Number(id))
      if (removingCurrent) {
        resetCurrentConversation()
        state.conversation.value = null
      }
      await refresh()
      toast.success(translate('common.success'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : translate('common.error'))
    } finally {
      state.loading.value = false
    }
  }

  return { refresh, ensure, createNew, select, remove }
}
