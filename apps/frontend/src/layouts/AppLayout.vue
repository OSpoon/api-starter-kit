<script setup lang="ts">
import AiChatAssistant from '@/components/AiChatAssistant.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import SiteHeader from '@/components/SiteHeader.vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useAiChat } from '@/composables/useAiChat'

const route = useRoute()
const { t } = useI18n()

const {
  aiConversations,
  aiConversation,
  aiStreamingMessageId,
  aiLoading,
  aiSuggestions,
  allAiSuggestions,
  aiCredentialDisclosure,
  aiApprovalDismissed,
  pendingAiConfirmation,
  aiConfirming,
  displayedAiChatMessages,
  handleAiNewChat,
  handleAiCopyMessage,
  handleAiDeleteConversation,
  handleAiRetryMessage,
  refreshAiSuggestions,
  confirmAiConfirmation,
  dismissAiConfirmation,
  handleAiCopyCredential,
  handleAiSend,
  handleAiSelectConversation,
  handleAiStop,
} = useAiChat()

const breadcrumbs = computed(() => {
  type Crumb = { label: string; to?: string }

  return route.matched
    .filter((matched) => matched.meta.title)
    .map((matched, index, matchedRoutes) => ({
      label: t(matched.meta.title as string),
      to: index < matchedRoutes.length - 1 ? matched.path : undefined,
    })) satisfies Crumb[]
})
</script>

<template>
  <SidebarProvider class="h-svh overflow-hidden">
    <AppSidebar />
    <SidebarInset class="flex min-h-0 flex-col overflow-hidden">
      <SiteHeader :breadcrumbs="breadcrumbs" />
      <div class="flex min-h-0 flex-1 flex-col overflow-auto bg-muted/5 font-sans">
        <div class="flex min-h-0 flex-1 flex-col">
          <RouterView />
        </div>
        <footer class="py-4 text-center text-sm text-muted-foreground">
          {{ t('footer.copyright') }}
        </footer>
      </div>
      <AiChatAssistant
        :messages="displayedAiChatMessages"
        :conversations="aiConversations"
        :current-conversation-id="aiConversation?.id"
        :streaming-message-id="aiStreamingMessageId"
        :loading="aiLoading"
        :suggestions="aiSuggestions"
        :can-refresh-suggestions="allAiSuggestions.length > 3"
        :approval="aiApprovalDismissed ? null : pendingAiConfirmation"
        :approval-loading="aiConfirming"
        :credential-disclosure="aiCredentialDisclosure"
        @clear="handleAiNewChat"
        @copy-message="handleAiCopyMessage"
        @delete-conversation="handleAiDeleteConversation"
        @retry-message="handleAiRetryMessage"
        @refresh-suggestions="refreshAiSuggestions"
        @approve-confirmation="confirmAiConfirmation"
        @dismiss-confirmation="dismissAiConfirmation"
        @dismiss-credential="aiCredentialDisclosure = null"
        @copy-credential="handleAiCopyCredential"
        @send="handleAiSend"
        @select-conversation="handleAiSelectConversation"
        @stop="handleAiStop"
      />
    </SidebarInset>
  </SidebarProvider>
</template>
