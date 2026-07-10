<script setup lang="ts">
import { toast } from 'vue-sonner'

import type { AiMessageContentStatus } from '@/components/ai-chat/AiMessageContent.vue'
import AiChatAssistant from '@/components/AiChatAssistant.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import SiteHeader from '@/components/SiteHeader.vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
  type AiChatConversation,
  type AiChatConversationSummary,
  type AiChatMessage,
  createAiChatConversation,
  deleteAiChatConversation,
  getAiChatConversation,
  listAiChatConversations,
  streamAiChatMessage,
} from '@/lib/ai-chat-api'
import { copyText } from '@/lib/clipboard'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

const route = useRoute()
const { t } = useI18n()
const auth = useAuthStore()
const settingsStore = useSettingsStore()
const aiLoading = ref(false)
const aiConversation = ref<AiChatConversation | null>(null)
const aiConversations = ref<AiChatConversationSummary[]>([])
const aiStreamingMessages = ref<
  Array<
    | AiChatMessage
    | { id: string; role: 'user' | 'assistant'; content: string; status?: AiMessageContentStatus }
  >
>([])
const aiStreamingMessageId = ref<string | number | null>(null)
const aiAbortController = ref<AbortController | null>(null)

type LocalAiChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: AiMessageContentStatus
}

type DisplayAiChatMessage = {
  id?: string | number
  role: 'user' | 'assistant'
  content: string
  status?: AiMessageContentStatus
}

const breadcrumbs = computed(() => {
  type Crumb = { label: string; to?: string }

  return route.matched
    .filter((matched) => matched.meta.title)
    .map((matched, index, matchedRoutes) => ({
      label: t(matched.meta.title as string),
      to: index < matchedRoutes.length - 1 ? matched.path : undefined,
    })) satisfies Crumb[]
})

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
    aiConversation.value = await getAiChatConversation(auth.token, Number(id))
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

  await handleAiSend(previousUserMessage.content)
}

async function handleAiSend(message: string) {
  aiAbortController.value?.abort()
  const abortController = new AbortController()
  aiAbortController.value = abortController
  aiLoading.value = true
  const currentMessages = aiConversation.value?.messages ?? []
  const userMessage: LocalAiChatMessage = {
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
  aiStreamingMessages.value = [...currentMessages, userMessage, assistantMessage]

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
            item.id === userMessage.id ? event.message : item
          )
        }

        if (event.type === 'delta') {
          assistantMessage.content += event.content
          assistantMessage.status = 'streaming'
          aiStreamingMessages.value = aiStreamingMessages.value.map((item) =>
            item.id === assistantMessage.id ? { ...assistantMessage } : item
          )
        }

        if (event.type === 'done') {
          aiConversation.value = event.conversation
          aiStreamingMessageId.value = null
          assistantMessage.content = event.message.content
          assistantMessage.status = 'done'
          aiStreamingMessages.value = aiStreamingMessages.value.map((item) =>
            item.id === assistantMessage.id ? { ...assistantMessage } : item
          )
        }

        if (event.type === 'error') {
          throw new Error(event.message)
        }
      },
      abortController.signal
    )
    await refreshAiConversations()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      assistantMessage.status = assistantMessage.content.trim() ? 'interrupted' : 'done'
      aiStreamingMessages.value = aiStreamingMessages.value.map((item) =>
        item.id === assistantMessage.id ? { ...assistantMessage } : item
      )
    } else {
      assistantMessage.status = 'error'
      aiStreamingMessages.value = aiStreamingMessages.value.map((item) =>
        item.id === assistantMessage.id ? { ...assistantMessage } : item
      )
      toast.error(error instanceof Error ? error.message : t('common.error'))
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
</script>

<template>
  <SidebarProvider class="h-svh overflow-hidden">
    <AppSidebar />
    <SidebarInset class="flex min-h-0 flex-col overflow-hidden">
      <SiteHeader :breadcrumbs="breadcrumbs" />
      <div class="flex flex-1 flex-col overflow-auto bg-muted/5 font-sans">
        <div class="flex-1">
          <RouterView />
        </div>
        <footer class="py-4 text-center text-sm text-muted-foreground">
          {{ t('footer.built_by', { platform: settingsStore.platformName }) }}
        </footer>
      </div>
      <AiChatAssistant
        :messages="
          aiStreamingMessages.length ? aiStreamingMessages : (aiConversation?.messages ?? [])
        "
        :conversations="aiConversations"
        :current-conversation-id="aiConversation?.id"
        :streaming-message-id="aiStreamingMessageId"
        :loading="aiLoading"
        @clear="handleAiNewChat"
        @copy-message="handleAiCopyMessage"
        @delete-conversation="handleAiDeleteConversation"
        @retry-message="handleAiRetryMessage"
        @send="handleAiSend"
        @select-conversation="handleAiSelectConversation"
        @stop="handleAiStop"
      />
    </SidebarInset>
  </SidebarProvider>
</template>
