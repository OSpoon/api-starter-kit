import { toast } from 'vue-sonner'

import type {
  AiChatConfirmation,
  AiChatCredentialDisclosure,
  AiChatRunMeta,
  AiChatTimelineItem,
} from '@/features/ai/api'
import {
  type AiChatConversation,
  type AiChatConversationSummary,
  type AiChatMessage,
  confirmAiAgentAction,
} from '@/features/ai/api'
import { useAiChatConversations } from '@/features/ai/composables/useAiChatConversations'
import { useAiChatStream } from '@/features/ai/composables/useAiChatStream'
import { formatAiChatMessagesAsMarkdown } from '@/features/ai/markdown'
import { getAiChatSuggestions, pickRandomAiChatSuggestions } from '@/features/ai/suggestions'
import type { DisplayAiChatMessage, LocalAiChatMessage } from '@/features/ai/types'
import { copyText } from '@/lib/clipboard'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

export function useAiChat() {
  const route = useRoute()
  const { t } = useI18n()
  const auth = useAuthStore()
  const settingsStore = useSettingsStore()

  const aiLoading = ref(false)
  const aiConversation = ref<AiChatConversation | null>(null)
  const aiConversations = ref<AiChatConversationSummary[]>([])
  const aiStreamingMessages = ref<Array<AiChatMessage | LocalAiChatMessage>>([])
  const aiStreamingMessageId = ref<string | number | null>(null)
  const aiAbortController = ref<AbortController | null>(null)
  const pendingAiConfirmation = ref<AiChatConfirmation | null>(null)
  const aiConfirmations = ref<AiChatConfirmation[]>([])
  const aiConfirming = ref(false)
  const aiApprovalDismissed = ref(false)
  const aiCredentialDisclosure = ref<AiChatCredentialDisclosure | null>(null)
  const aiSuggestions = ref<string[]>([])
  const aiRunMeta = ref<AiChatRunMeta | null>(null)

  const conversationManager = useAiChatConversations(
    () => auth.token,
    (key) => t(key),
    {
      loading: aiLoading,
      conversation: aiConversation,
      conversations: aiConversations,
      streamingMessages: aiStreamingMessages,
      streamingMessageId: aiStreamingMessageId,
      abortController: aiAbortController,
      confirmations: aiConfirmations,
      pendingConfirmation: pendingAiConfirmation,
      approvalDismissed: aiApprovalDismissed,
      runMeta: aiRunMeta,
    },
    presentLatestAiConfirmation
  )

  const displayedAiChatMessages = computed<DisplayAiChatMessage[]>(() => {
    const messages = aiStreamingMessages.value.length
      ? aiStreamingMessages.value
      : (aiConversation.value?.messages ?? [])
    return messages
  })

  const allAiSuggestions = computed(() => {
    return getAiChatSuggestions({
      permissions: auth.user?.permissions,
      routeName: route.name,
      translate: t,
    })
  })

  const aiPageContext = computed(() => {
    const lastMatched = [...route.matched].reverse().find((matched) => matched.meta.title)
    const title = lastMatched ? t(lastMatched.meta.title as string) : settingsStore.platformName

    return {
      route: route.path,
      title,
    }
  })

  function refreshAiSuggestions() {
    aiSuggestions.value = pickRandomAiChatSuggestions(allAiSuggestions.value)
  }

  watch(
    allAiSuggestions,
    () => {
      aiSuggestions.value = pickRandomAiChatSuggestions(allAiSuggestions.value)
    },
    { immediate: true }
  )

  function getDisplayedAiMessages() {
    return aiStreamingMessages.value.length
      ? aiStreamingMessages.value
      : (aiConversation.value?.messages ?? [])
  }

  function handleAiStop() {
    const streamingMessageId = aiStreamingMessageId.value
    aiAbortController.value?.abort()
    aiAbortController.value = null
    aiStreamingMessageId.value = null
    aiLoading.value = false
    aiStreamingMessages.value = aiStreamingMessages.value.map((item) =>
      item.id === streamingMessageId && item.role === 'assistant'
        ? { ...item, status: 'interrupted' as const }
        : item
    )
  }

  async function handleAiCopyMessage(message: DisplayAiChatMessage) {
    try {
      await copyText(message.content)
      toast.success(t('ai_chat.copy_success'))
    } catch {
      toast.error(t('ai_chat.copy_failed'))
    }
  }

  async function handleAiCopyMessagesAsMarkdown(messages: DisplayAiChatMessage[]) {
    if (messages.length === 0) {
      return
    }

    try {
      await copyText(
        formatAiChatMessagesAsMarkdown(messages, {
          conversation: t('ai_chat.shared_conversation'),
          user: t('ai_chat.user'),
          assistant: t('ai_chat.assistant'),
        })
      )
      toast.success(t('ai_chat.share_success'))
    } catch {
      toast.error(t('ai_chat.copy_failed'))
    }
  }

  async function handleAiCopyCredential(credential: AiChatCredentialDisclosure) {
    try {
      await copyText(credential.value)
      toast.success(t('ai_chat.credential.copy_success'))
    } catch {
      toast.error(t('ai_chat.credential.copy_failed'))
    }
  }

  function presentLatestAiConfirmation(confirmations: AiChatConfirmation[]) {
    const confirmation = confirmations.at(-1)
    if (!confirmation) {
      pendingAiConfirmation.value = null
      aiApprovalDismissed.value = false
      return
    }

    pendingAiConfirmation.value = confirmation
    aiApprovalDismissed.value = false
  }

  function dismissAiConfirmation() {
    aiApprovalDismissed.value = true
  }

  function appendConfirmationTimeline(
    messageId: number,
    confirmation: AiChatConfirmation,
    status: 'confirmed' | 'failed' | 'expired'
  ) {
    const item: AiChatTimelineItem = {
      kind: 'confirmation',
      action: confirmation.action,
      targetLabel: confirmation.presentation.targetLabel,
      status,
      completedAt: new Date().toISOString(),
    }
    if (aiConversation.value) {
      aiConversation.value = {
        ...aiConversation.value,
        messages: aiConversation.value.messages.map((message) =>
          message.id === messageId
            ? { ...message, timeline: [...(message.timeline ?? []), item] }
            : message
        ),
      }
    }
  }

  async function confirmAiConfirmation() {
    const confirmation = pendingAiConfirmation.value
    const conversation = aiConversation.value
    if (!confirmation || !conversation) {
      return
    }

    aiConfirming.value = true
    try {
      const result = await confirmAiAgentAction(auth.token, conversation.id, confirmation.id)
      aiCredentialDisclosure.value = result.result?.credential ?? null
      aiConfirmations.value = aiConfirmations.value.filter((item) => item.id !== confirmation.id)
      pendingAiConfirmation.value = null
      aiApprovalDismissed.value = false
      appendConfirmationTimeline(confirmation.messageId, confirmation, 'confirmed')
      toast.success(t('ai_chat.confirmations.success'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    } finally {
      aiConfirming.value = false
    }
  }

  async function handleAiRetryMessage(message: DisplayAiChatMessage) {
    const messages = getDisplayedAiMessages()
    const messageIndex = messages.findIndex((item) => item.id === message.id)
    const previousUserMessage = messages
      .slice(0, messageIndex >= 0 ? messageIndex : messages.length)
      .reverse()
      .find((item) => item.role === 'user')

    if (!previousUserMessage) {
      return
    }

    await handleAiSend(previousUserMessage.content, Number(message.id))
  }

  const { send: handleAiSend } = useAiChatStream(
    () => auth.token,
    (key) => t(key),
    aiPageContext,
    {
      loading: aiLoading,
      conversation: aiConversation,
      conversations: aiConversations,
      streamingMessages: aiStreamingMessages,
      streamingMessageId: aiStreamingMessageId,
      abortController: aiAbortController,
      confirmations: aiConfirmations,
      pendingConfirmation: pendingAiConfirmation,
      approvalDismissed: aiApprovalDismissed,
      runMeta: aiRunMeta,
    },
    conversationManager.ensure,
    conversationManager.refresh,
    presentLatestAiConfirmation
  )

  onMounted(() => {
    void conversationManager.refresh().catch(() => undefined)
  })

  return {
    aiLoading,
    aiConversation,
    aiConversations,
    aiStreamingMessages,
    aiStreamingMessageId,
    pendingAiConfirmation,
    aiConfirmations,
    aiConfirming,
    aiApprovalDismissed,
    aiCredentialDisclosure,
    aiSuggestions,
    aiRunMeta,
    displayedAiChatMessages,
    allAiSuggestions,
    aiPageContext,
    refreshAiSuggestions,
    refreshAiConversations: conversationManager.refresh,
    ensureAiConversation: conversationManager.ensure,
    handleAiNewChat: conversationManager.createNew,
    handleAiSelectConversation: conversationManager.select,
    handleAiDeleteConversation: conversationManager.remove,
    handleAiStop,
    handleAiCopyMessage,
    handleAiCopyMessagesAsMarkdown,
    handleAiCopyCredential,
    presentLatestAiConfirmation,
    dismissAiConfirmation,
    confirmAiConfirmation,
    handleAiRetryMessage,
    handleAiSend,
  }
}
