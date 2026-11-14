<script setup lang="ts">
import AiChatAssistant from '@/components/ai-chat/AiChatAssistant.vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAiChat } from '@/composables/useAiChat'
import { setRuntimeEmbedAuth } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

import { notifyAssistantEmbedResize } from '@assistant/lib/embed'
import { isAssistantConnectionRuntime } from '@assistant/lib/runtime'
import { ChevronsUpDown, LogOut, Server } from '@lucide/vue'
import { toast } from 'vue-sonner'

const route = useRoute()
const isEmbedded = computed(() => route.name === 'embed')
const isOpen = ref(!isEmbedded.value)
const auth = useAuthStore()
const router = useRouter()
const { t } = useI18n()

onMounted(() => {
  if (isEmbedded.value) document.body.style.backgroundColor = 'transparent'
})

onBeforeUnmount(() => {
  if (isEmbedded.value) document.body.style.backgroundColor = ''
})

watch(isOpen, (open) => {
  if (isEmbedded.value) notifyAssistantEmbedResize(open)
})

onBeforeRouteLeave(() => {
  if (isEmbedded.value) setRuntimeEmbedAuth(null)
})

const accountName = computed(() => auth.user?.fullName || auth.user?.email || t('nav.account'))
const accountInitials = computed(() => {
  if (auth.user?.initials) return auth.user.initials

  return accountName.value
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
})

async function handleLogout() {
  await auth.logout()
  toast.success(t('auth.logout_success'))
  await router.replace({ name: 'login', query: { redirect: '/dashboard' } })
}

const {
  aiConversations,
  aiConversationsLoading,
  hasMoreAiConversations,
  aiConversation,
  aiStreamingMessageId,
  aiLoading,
  aiUsage,
  aiUsageError,
  aiUsageLoading,
  aiCredentialDisclosure,
  aiApprovalDismissed,
  aiVoiceTranscribing,
  pendingAiConfirmation,
  aiConfirming,
  displayedAiChatMessages,
  hasOlderAiMessages,
  aiOlderMessagesLoading,
  handleAiNewChat,
  handleAiCopyMessage,
  handleAiCopyMessagesAsMarkdown,
  handleAiDeleteConversation,
  handleAiRetryMessage,
  confirmAiConfirmation,
  dismissAiConfirmation,
  handleAiCopyCredential,
  handleAiSend,
  handleAiSendImage,
  handleAiVoiceSend,
  handleAiSelectConversation,
  handleAiStop,
  loadMoreAiConversations,
  loadOlderAiMessages,
  refreshAiUsage,
} = useAiChat()
</script>

<template>
  <main
    :class="
      isEmbedded
        ? 'h-svh overflow-hidden bg-transparent p-0'
        : 'h-svh overflow-hidden bg-sidebar p-0 md:p-2'
    "
  >
    <div
      :class="
        isEmbedded
          ? 'size-full overflow-hidden bg-transparent'
          : 'size-full overflow-hidden rounded-xl bg-background shadow-sm'
      "
    >
      <AiChatAssistant
        v-model="isOpen"
        :mode="isEmbedded ? 'floating' : 'page'"
        :messages="displayedAiChatMessages"
        :conversations="aiConversations"
        :has-more-conversations="hasMoreAiConversations"
        :loading-conversations="aiConversationsLoading"
        :has-older-messages="hasOlderAiMessages"
        :loading-older-messages="aiOlderMessagesLoading"
        :current-conversation-id="aiConversation?.id"
        :streaming-message-id="aiStreamingMessageId"
        :loading="aiLoading"
        :usage="aiUsage"
        :usage-error="aiUsageError"
        :usage-loading="aiUsageLoading"
        :approval="aiApprovalDismissed ? null : pendingAiConfirmation"
        :approval-loading="aiConfirming"
        :credential-disclosure="aiCredentialDisclosure"
        :voice-transcribing="aiVoiceTranscribing"
        @clear="handleAiNewChat"
        @copy-message="handleAiCopyMessage"
        @copy-messages-as-markdown="handleAiCopyMessagesAsMarkdown"
        @delete-conversation="handleAiDeleteConversation"
        @load-more-conversations="loadMoreAiConversations"
        @load-older-messages="loadOlderAiMessages"
        @retry-message="handleAiRetryMessage"
        @approve-confirmation="confirmAiConfirmation"
        @dismiss-confirmation="dismissAiConfirmation"
        @dismiss-credential="aiCredentialDisclosure = null"
        @copy-credential="handleAiCopyCredential"
        @send="handleAiSend"
        @send-image="handleAiSendImage"
        @voice-send="handleAiVoiceSend"
        @select-conversation="handleAiSelectConversation"
        @stop="handleAiStop"
        @usage-open="refreshAiUsage"
      >
        <template v-if="!isEmbedded" #sidebarFooter>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                class="h-12 w-full justify-start gap-2 rounded-md p-2 text-left text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                :aria-label="accountName"
              >
                <Avatar class="size-8 rounded-lg">
                  <AvatarFallback class="rounded-lg">
                    {{ accountInitials }}
                  </AvatarFallback>
                </Avatar>
                <span class="grid min-w-0 flex-1 text-left text-sm/tight">
                  <span class="truncate font-medium">{{ accountName }}</span>
                  <span class="truncate text-xs text-muted-foreground">
                    {{ auth.user?.email }}
                  </span>
                </span>
                <ChevronsUpDown class="ml-auto size-4 opacity-50" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="end"
              :side-offset="4"
              class="w-(--reka-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            >
              <DropdownMenuItem
                v-if="isAssistantConnectionRuntime()"
                @click="router.push({ name: 'connection' })"
              >
                <Server class="size-4" aria-hidden="true" />
                {{ t('assistant_connection.change_connection') }}
              </DropdownMenuItem>
              <DropdownMenuItem @click="handleLogout">
                <LogOut class="size-4" aria-hidden="true" />
                {{ t('auth.logout') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </template>
      </AiChatAssistant>
    </div>
  </main>
</template>
