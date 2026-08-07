import { toast } from 'vue-sonner'

import type { AiMessageContentStatus } from '@/components/ai-chat/AiMessageContent.vue'
import type {
  AiChatAgentActivity,
  AiChatCitation,
  AiChatConfirmation,
  AiChatCredentialDisclosure,
  AiChatPendingConfirmation,
} from '@/lib/ai-chat-api'
import {
  type AiChatConversation,
  type AiChatConversationSummary,
  type AiChatMessage,
  AiChatStreamIncompleteError,
  confirmAiAgentAction,
  createAiChatConversation,
  deleteAiChatConversation,
  getAiChatConversation,
  listAiChatConversations,
  streamAiChatMessage,
} from '@/lib/ai-chat-api'
import { formatAiChatMessagesAsMarkdown } from '@/lib/ai-chat-markdown'
import { getAiChatSuggestions, pickRandomAiChatSuggestions } from '@/lib/ai-chat-suggestions'
import { copyText } from '@/lib/clipboard'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

type LocalAiChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: AiMessageContentStatus
  activity?: AiChatAgentActivity
  citations?: AiChatCitation[]
}

export type DisplayAiChatMessage = {
  id?: string | number
  role: 'user' | 'assistant'
  content: string
  status?: AiMessageContentStatus
  activity?: AiChatAgentActivity
}

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

  async function refreshAiConversations() {
    aiConversations.value = await listAiChatConversations(auth.token)
  }

  async function ensureAiConversation() {
    if (aiConversation.value) {
      return aiConversation.value
    }

    const conversation = await createAiChatConversation(auth.token)
    aiConversation.value = conversation
    await refreshAiConversations()
    return conversation
  }

  async function handleAiNewChat() {
    aiAbortController.value?.abort()
    aiAbortController.value = null
    aiStreamingMessages.value = []
    aiStreamingMessageId.value = null
    aiConfirmations.value = []
    pendingAiConfirmation.value = null
    aiApprovalDismissed.value = false
    aiConversation.value = await createAiChatConversation(auth.token)
    await refreshAiConversations()
  }

  async function handleAiSelectConversation(id: string | number) {
    aiLoading.value = true
    try {
      aiAbortController.value?.abort()
      aiAbortController.value = null
      aiStreamingMessages.value = []
      aiStreamingMessageId.value = null
      aiConfirmations.value = []
      pendingAiConfirmation.value = null
      aiApprovalDismissed.value = false
      aiConversation.value = await getAiChatConversation(auth.token, Number(id))
      aiConfirmations.value = aiConversation.value.confirmations ?? []
      presentLatestAiConfirmation(aiConfirmations.value)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    } finally {
      aiLoading.value = false
    }
  }

  async function handleAiDeleteConversation(id: string | number) {
    aiLoading.value = true
    try {
      if (aiConversation.value?.id === Number(id)) {
        aiAbortController.value?.abort()
        aiAbortController.value = null
      }
      await deleteAiChatConversation(auth.token, Number(id))
      if (aiConversation.value?.id === Number(id)) {
        aiConversation.value = null
        aiConfirmations.value = []
        pendingAiConfirmation.value = null
        aiApprovalDismissed.value = false
        aiStreamingMessages.value = []
        aiStreamingMessageId.value = null
      }
      await refreshAiConversations()
      toast.success(t('common.success'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    } finally {
      aiLoading.value = false
    }
  }

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

  async function handleAiSend(message: string, regenerateAssistantMessageId?: number) {
    aiAbortController.value?.abort()
    const abortController = new AbortController()
    aiAbortController.value = abortController
    aiLoading.value = true
    const currentMessages = aiConversation.value?.messages ?? []
    const userMessage = regenerateAssistantMessageId
      ? null
      : {
          id: `local-user-${Date.now()}`,
          role: 'user' as const,
          content: message,
        }
    const assistantMessage: LocalAiChatMessage = {
      id: `streaming-assistant-${Date.now()}`,
      role: 'assistant' as const,
      content: '',
      status: 'pending' as const,
    }
    aiStreamingMessageId.value = assistantMessage.id
    aiStreamingMessages.value = regenerateAssistantMessageId
      ? [
          ...currentMessages.filter((item) => item.id !== regenerateAssistantMessageId),
          assistantMessage,
        ]
      : [...currentMessages, userMessage!, assistantMessage]
    const newlyCreatedAiConfirmationIds = new Set<number>()
    let completedAssistantMessageId: number | null = null
    let streamedConfirmation: AiChatPendingConfirmation | null = null

    try {
      const conversation = await ensureAiConversation()
      await streamAiChatMessage(
        auth.token,
        conversation.id,
        message,
        (event) => {
          if (event.type === 'user') {
            aiConversations.value = [
              event.conversation,
              ...aiConversations.value.filter((item) => item.id !== event.conversation.id),
            ]
            aiStreamingMessages.value = aiStreamingMessages.value.map((item) =>
              userMessage && item.id === userMessage.id ? event.message : item
            )
          }

          if (event.type === 'delta') {
            assistantMessage.content += event.content
            assistantMessage.status = 'streaming'
            aiStreamingMessages.value = aiStreamingMessages.value.map((item) =>
              item.id === assistantMessage.id ? { ...assistantMessage } : item
            )
          }

          if (event.type === 'agent_status') {
            assistantMessage.activity = {
              name: event.name,
              state: event.state,
              message: event.message,
            }
            aiStreamingMessages.value = aiStreamingMessages.value.map((item) =>
              item.id === assistantMessage.id ? { ...assistantMessage } : item
            )
          }

          if (event.type === 'agent_citations') {
            assistantMessage.citations = event.citations
            aiStreamingMessages.value = aiStreamingMessages.value.map((item) =>
              item.id === assistantMessage.id ? { ...assistantMessage } : item
            )
          }

          if (event.type === 'agent_confirmation') {
            streamedConfirmation = {
              id: event.id,
              action: event.action,
              impact: event.impact,
              targetType: event.targetType,
              targetId: event.targetId,
              targetSummary: event.targetSummary,
              changeSummary: event.changeSummary,
              expiresAt: event.expiresAt,
            }
          }

          if (event.type === 'done') {
            completedAssistantMessageId = event.message.id
            event.confirmations.forEach((confirmation) => {
              newlyCreatedAiConfirmationIds.add(confirmation.id)
            })
            aiConversation.value = {
              ...event.conversation,
              confirmations: [
                ...aiConfirmations.value,
                ...event.confirmations.map((confirmation) => ({
                  ...confirmation,
                  messageId: event.message.id,
                })),
              ],
            }
            aiConfirmations.value = aiConversation.value.confirmations ?? []
            aiStreamingMessageId.value = null
            aiStreamingMessages.value = []
            const confirmation = event.confirmations.at(-1) ?? streamedConfirmation
            if (confirmation) {
              presentLatestAiConfirmation([{ ...confirmation, messageId: event.message.id }])
            }
          }

          if (event.type === 'error') {
            assistantMessage.content = event.assistantMessage?.content ?? event.message
            assistantMessage.citations = event.assistantMessage?.citations ?? []
            assistantMessage.status = 'error'
            aiStreamingMessages.value = aiStreamingMessages.value.map((item) =>
              item.id === assistantMessage.id ? { ...assistantMessage } : item
            )
            throw new Error(event.message)
          }
        },
        {
          signal: abortController.signal,
          context: aiPageContext.value,
          regenerateAssistantMessageId,
        }
      )
      const persistedConversation = await getAiChatConversation(auth.token, conversation.id)
      aiConversation.value = persistedConversation
      aiConfirmations.value = persistedConversation.confirmations ?? []
      const latestCreatedConfirmation = aiConfirmations.value
        .filter(
          (confirmation) =>
            newlyCreatedAiConfirmationIds.has(confirmation.id) ||
            confirmation.messageId === completedAssistantMessageId
        )
        .at(-1)
      if (latestCreatedConfirmation) {
        presentLatestAiConfirmation([latestCreatedConfirmation])
      }
      await refreshAiConversations()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        assistantMessage.status = assistantMessage.content.trim() ? 'interrupted' : 'done'
        aiStreamingMessages.value = aiStreamingMessages.value.map((item) =>
          item.id === assistantMessage.id ? { ...assistantMessage } : item
        )
      } else {
        // A proxy can close an SSE response after the backend has already saved
        // the assistant message, but before its terminal `done` event reaches
        // the browser. Recover the persisted result instead of presenting a
        // complete visible reply as an error.
        if (error instanceof AiChatStreamIncompleteError && aiConversation.value) {
          try {
            const persistedConversation = await getAiChatConversation(
              auth.token,
              aiConversation.value.id
            )
            let currentUserMessageIndex = -1
            for (let index = persistedConversation.messages.length - 1; index >= 0; index -= 1) {
              const candidate = persistedConversation.messages[index]
              if (candidate?.role === 'user' && candidate.content === message) {
                currentUserMessageIndex = index
                break
              }
            }
            const persistedAssistantMessage =
              currentUserMessageIndex >= 0
                ? persistedConversation.messages[currentUserMessageIndex + 1]
                : undefined
            if (
              persistedAssistantMessage?.role === 'assistant' &&
              persistedAssistantMessage.content.trim()
            ) {
              aiConversation.value = persistedConversation
              aiConfirmations.value = persistedConversation.confirmations ?? []
              aiStreamingMessageId.value = null
              aiStreamingMessages.value = []
              await refreshAiConversations()
              return
            }
          } catch {
            // Fall through to the rendered-content fallback below.
          }
        }
        if (error instanceof AiChatStreamIncompleteError && assistantMessage.content.trim()) {
          // The reply is already usable in the UI. A missing terminal frame must
          // not turn a visible answer into a false failure notification.
          assistantMessage.status = 'done'
          aiStreamingMessageId.value = null
          aiStreamingMessages.value = aiStreamingMessages.value.map((item) =>
            item.id === assistantMessage.id ? { ...assistantMessage } : item
          )
          return
        }
        assistantMessage.status = 'error'
        aiStreamingMessages.value = aiStreamingMessages.value.map((item) =>
          item.id === assistantMessage.id ? { ...assistantMessage } : item
        )
        toast.error(
          error instanceof AiChatStreamIncompleteError
            ? t('ai_chat.stream_incomplete')
            : error instanceof Error
              ? error.message
              : t('common.error')
        )
      }
    } finally {
      if (aiAbortController.value === abortController) {
        aiAbortController.value = null
        aiStreamingMessageId.value = null
        aiLoading.value = false
      }
    }
  }

  onMounted(() => {
    void refreshAiConversations().catch(() => undefined)
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
    displayedAiChatMessages,
    allAiSuggestions,
    aiPageContext,
    refreshAiSuggestions,
    refreshAiConversations,
    ensureAiConversation,
    handleAiNewChat,
    handleAiSelectConversation,
    handleAiDeleteConversation,
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
