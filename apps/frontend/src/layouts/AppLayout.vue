<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'

import AiChatAssistant from '@/components/AiChatAssistant.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import SiteHeader from '@/components/SiteHeader.vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
  createAiChatConversation,
  deleteAiChatConversation,
  getAiChatConversation,
  listAiChatConversations,
  streamAiChatMessage,
  type AiChatConversation,
  type AiChatMessage,
  type AiChatConversationSummary,
} from '@/lib/ai-chat-api'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

const route = useRoute()
const { t } = useI18n()
const auth = useAuthStore()
const settingsStore = useSettingsStore()
const aiLoading = ref(false)
const aiConversation = ref<AiChatConversation | null>(null)
const aiConversations = ref<AiChatConversationSummary[]>([])
const aiStreamingMessages = ref<Array<AiChatMessage | { id: string; role: 'user' | 'assistant'; content: string }>>([])
const aiStreamingMessageId = ref<string | number | null>(null)

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
  aiStreamingMessages.value = []
  aiStreamingMessageId.value = null
  aiConversation.value = await createAiChatConversation(auth.token)
  await refreshAiConversations()
}

async function handleAiSelectConversation(id: string | number) {
  aiLoading.value = true
  try {
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

async function handleAiSend(message: string) {
  aiLoading.value = true
  const currentMessages = aiConversation.value?.messages ?? []
  const userMessage = {
    id: `local-user-${Date.now()}`,
    role: 'user' as const,
    content: message,
  }
  const assistantMessage = {
    id: `streaming-assistant-${Date.now()}`,
    role: 'assistant' as const,
    content: '',
  }
  aiStreamingMessageId.value = assistantMessage.id
  aiStreamingMessages.value = [...currentMessages, userMessage, assistantMessage]

  try {
    const conversation = await ensureAiConversation()
    await streamAiChatMessage(auth.token, conversation.id, message, (event) => {
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
        aiStreamingMessages.value = aiStreamingMessages.value.map((item) =>
          item.id === assistantMessage.id ? { ...assistantMessage } : item
        )
      }

      if (event.type === 'done') {
        aiConversation.value = event.conversation
        aiStreamingMessageId.value = null
        assistantMessage.content = event.message.content
        aiStreamingMessages.value = aiStreamingMessages.value.map((item) =>
          item.id === assistantMessage.id ? { ...assistantMessage } : item
        )
      }

      if (event.type === 'error') {
        throw new Error(event.message)
      }
    })
    await refreshAiConversations()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.error'))
  } finally {
    aiStreamingMessageId.value = null
    aiLoading.value = false
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
        :messages="aiStreamingMessages.length ? aiStreamingMessages : (aiConversation?.messages ?? [])"
        :conversations="aiConversations"
        :current-conversation-id="aiConversation?.id"
        :streaming-message-id="aiStreamingMessageId"
        :loading="aiLoading"
        @clear="handleAiNewChat"
        @delete-conversation="handleAiDeleteConversation"
        @send="handleAiSend"
        @select-conversation="handleAiSelectConversation"
      />
    </SidebarInset>
  </SidebarProvider>
</template>
