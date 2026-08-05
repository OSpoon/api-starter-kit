<script setup lang="ts">
import {
  Bot,
  ChevronDown,
  History,
  MessageCircle,
  MessageCirclePlus,
  Minus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from '@lucide/vue'

import AiChatApprovalCard from '@/components/ai-chat/AiChatApprovalCard.vue'
import AiChatCredentialCard from '@/components/ai-chat/AiChatCredentialCard.vue'
import AiChatMessageItem from '@/components/ai-chat/AiChatMessageItem.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import type { DisplayAiChatMessage } from '@/composables/useAiChat'
import type { AiChatConfirmation, AiChatCredentialDisclosure } from '@/lib/ai-chat-api'

interface ChatConversation {
  id: string | number
  title: string
}

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    title?: string
    placeholder?: string
    welcomeMessage?: string
    suggestions?: string[]
    canRefreshSuggestions?: boolean
    messages?: DisplayAiChatMessage[]
    conversations?: ChatConversation[]
    currentConversationId?: string | number | null
    streamingMessageId?: string | number | null
    loading?: boolean
    disabled?: boolean
    showMessageActions?: boolean
    approval?: AiChatConfirmation | null
    approvalLoading?: boolean
    credentialDisclosure?: AiChatCredentialDisclosure | null
  }>(),
  {
    modelValue: undefined,
    title: undefined,
    placeholder: undefined,
    welcomeMessage: undefined,
    suggestions: undefined,
    canRefreshSuggestions: false,
    messages: undefined,
    conversations: () => [],
    currentConversationId: null,
    streamingMessageId: null,
    loading: false,
    disabled: false,
    showMessageActions: true,
    approval: null,
    approvalLoading: false,
    credentialDisclosure: null,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  send: [message: string]
  clear: []
  selectConversation: [id: string | number]
  deleteConversation: [id: string | number]
  copyMessage: [message: DisplayAiChatMessage]
  retryMessage: [message: DisplayAiChatMessage]
  stop: []
  refreshSuggestions: []
  approveConfirmation: []
  dismissConfirmation: []
  dismissCredential: []
  copyCredential: [credential: AiChatCredentialDisclosure]
}>()

const { t } = useI18n()

const internalOpen = ref(false)
const input = ref('')
const isComposingInput = ref(false)
const compositionEndedAt = ref(0)
const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null)
const autoScrollEnabled = ref(true)

let scrollViewport: HTMLElement | null = null

const chatHeight = ref(600)
const chatWidth = ref(520)
const isResizing = ref(false)
const resizeStartX = ref(0)
const resizeStartY = ref(0)
const resizeStartWidth = ref(0)
const resizeStartHeight = ref(0)

const isControlled = computed(() => props.modelValue !== undefined)
const isOpen = computed({
  get: () => (isControlled.value ? Boolean(props.modelValue) : internalOpen.value),
  set: (value) => {
    if (!isControlled.value) {
      internalOpen.value = value
    }
    emit('update:modelValue', value)
  },
})

const welcomeMessage = computed(() => props.welcomeMessage || t('ai_chat.welcome'))
const displayMessages = computed(() => {
  if (props.messages) {
    return props.messages.length > 0
      ? props.messages
      : [{ id: 'welcome', role: 'assistant' as const, content: welcomeMessage.value }]
  }

  return []
})

const assistantTitle = computed(() => props.title || t('ai_chat.title'))
const inputPlaceholder = computed(() => props.placeholder || t('ai_chat.input_placeholder'))
const promptSuggestions = computed(
  () =>
    props.suggestions ?? [
      t('ai_chat.suggestions.api_keys'),
      t('ai_chat.suggestions.openapi'),
      t('ai_chat.suggestions.schema'),
    ]
)

function startResize(event: MouseEvent) {
  isResizing.value = true
  resizeStartX.value = event.clientX
  resizeStartY.value = event.clientY
  resizeStartWidth.value = chatWidth.value
  resizeStartHeight.value = chatHeight.value
  window.addEventListener('mousemove', onResize)
  window.addEventListener('mouseup', stopResize)
  document.body.style.userSelect = 'none'
}

function onResize(event: MouseEvent) {
  if (!isResizing.value) return

  const deltaY = resizeStartY.value - event.clientY
  chatHeight.value = Math.min(
    Math.max(resizeStartHeight.value + deltaY, 420),
    window.innerHeight - 32
  )

  const deltaX = resizeStartX.value - event.clientX
  chatWidth.value = Math.min(Math.max(resizeStartWidth.value + deltaX, 360), window.innerWidth - 32)
}

function stopResize() {
  isResizing.value = false
  window.removeEventListener('mousemove', onResize)
  window.removeEventListener('mouseup', stopResize)
  document.body.style.userSelect = ''
}

function getScrollViewport() {
  const root = scrollAreaRef.value?.$el as HTMLElement | undefined
  return root?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null
}

function isNearScrollBottom(viewport: HTMLElement) {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 32
}

function handleConversationScroll() {
  if (scrollViewport) {
    autoScrollEnabled.value = isNearScrollBottom(scrollViewport)
  }
}

function bindScrollViewport() {
  const viewport = getScrollViewport()
  if (viewport === scrollViewport) return viewport

  scrollViewport?.removeEventListener('scroll', handleConversationScroll)
  scrollViewport = viewport
  scrollViewport?.addEventListener('scroll', handleConversationScroll, { passive: true })
  if (scrollViewport) {
    autoScrollEnabled.value = isNearScrollBottom(scrollViewport)
  }
  return scrollViewport
}

function scrollToBottom(force = false) {
  if (!force && !autoScrollEnabled.value) return
  if (force) autoScrollEnabled.value = true

  nextTick(() => {
    const viewport = bindScrollViewport()
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
      autoScrollEnabled.value = true
    }
  })
}

function resumeAutoScroll() {
  scrollToBottom(true)
}

function openAssistant() {
  isOpen.value = true
  scrollToBottom(true)
}

function closeAssistant() {
  isOpen.value = false
}

function clearChat() {
  emit('clear')
  scrollToBottom(true)
}

function sendMessage(message = input.value) {
  const content = message.trim()
  if (!content || props.loading || props.disabled) {
    return
  }

  emit('send', content)
  input.value = ''
  scrollToBottom(true)
}

function stopGeneration() {
  emit('stop')
}

function isCompositionConfirming(event?: KeyboardEvent) {
  const keyCode = event ? (event as KeyboardEvent & { keyCode?: number }).keyCode : undefined

  return (
    isComposingInput.value ||
    event?.isComposing ||
    keyCode === 229 ||
    Date.now() - compositionEndedAt.value < 120
  )
}

function handleSubmit() {
  if (isCompositionConfirming()) {
    return
  }

  sendMessage()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) {
    return
  }

  if (isCompositionConfirming(event)) {
    return
  }

  event.preventDefault()
  sendMessage()
}

function handleCompositionStart() {
  isComposingInput.value = true
}

function handleCompositionEnd() {
  isComposingInput.value = false
  compositionEndedAt.value = Date.now()
}

function handlePaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text/plain')

  if (!text || !/[\r\n\u2028\u2029]/.test(text)) {
    return
  }

  event.preventDefault()

  const textarea = event.target as HTMLTextAreaElement
  const start = textarea.selectionStart ?? input.value.length
  const end = textarea.selectionEnd ?? input.value.length
  const pastedText = text.replace(/[\r\n\u2028\u2029]+/g, '')
  const nextValue = `${input.value.slice(0, start)}${pastedText}${input.value.slice(end)}`
  const cursorPosition = start + pastedText.length

  input.value = nextValue

  nextTick(() => {
    textarea.setSelectionRange(cursorPosition, cursorPosition)
  })
}

watch(
  () => displayMessages.value,
  () => {
    scrollToBottom()
  },
  { deep: true }
)

watch(isOpen, (value) => {
  if (value) {
    scrollToBottom(true)
  } else {
    scrollViewport?.removeEventListener('scroll', handleConversationScroll)
    scrollViewport = null
  }
})

onUnmounted(() => {
  stopResize()
  scrollViewport?.removeEventListener('scroll', handleConversationScroll)
})
</script>

<template>
  <div class="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
    <div
      v-if="isOpen"
      class="relative flex max-w-[calc(100vw-32px)] animate-in flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-lg slide-in-from-bottom-5 fade-in"
      :style="{ height: `${chatHeight}px`, width: `${chatWidth}px` }"
    >
      <div
        class="group absolute top-0 left-0 z-60 hidden size-4 cursor-nwse-resize items-center justify-center sm:flex"
        role="separator"
        :aria-label="t('ai_chat.resize_both')"
        @mousedown.prevent="startResize($event)"
      >
        <div
          class="size-2 rounded-br-sm border-r border-b border-border transition-colors group-hover:border-muted-foreground/50"
        />
      </div>

      <div class="flex items-center justify-between border-b bg-card px-4 py-3">
        <div class="flex min-w-0 items-center gap-2">
          <div
            class="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background"
          >
            <Bot class="size-4 text-primary" />
          </div>
          <span class="truncate text-sm font-medium">{{ assistantTitle }}</span>
        </div>
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            class="text-muted-foreground"
            size="icon-sm"
            :title="t('ai_chat.new_chat')"
            @click="clearChat"
          >
            <MessageCirclePlus class="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground"
                :title="t('ai_chat.history')"
              >
                <History class="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="max-h-80 w-64 overflow-y-auto">
              <div
                v-if="conversations.length === 0"
                class="p-3 text-center text-xs text-muted-foreground"
              >
                {{ t('ai_chat.no_history') }}
              </div>
              <DropdownMenuItem
                v-for="conversation in conversations"
                :key="conversation.id"
                class="group flex min-w-0 items-center justify-between gap-2"
                @click="emit('selectConversation', conversation.id)"
              >
                <span
                  class="min-w-0 flex-1 truncate"
                  :class="{ 'font-medium': conversation.id === currentConversationId }"
                >
                  {{ conversation.title }}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="shrink-0 text-muted-foreground"
                  :title="t('common.delete')"
                  @click.stop="emit('deleteConversation', conversation.id)"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground"
            :title="t('ai_chat.minimize')"
            @click="closeAssistant"
          >
            <Minus class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground"
            :title="t('common.cancel')"
            @click="closeAssistant"
          >
            <X class="size-4" />
          </Button>
        </div>
      </div>

      <div class="relative min-h-0 flex-1 p-4">
        <ScrollArea ref="scrollAreaRef" class="h-full">
          <div class="space-y-3 pr-3">
            <AiChatMessageItem
              v-for="(message, index) in displayMessages"
              :key="message.id ?? index"
              :message="message"
              :all-messages="displayMessages"
              :streaming-message-id="streamingMessageId"
              :loading="loading"
              :show-message-actions="showMessageActions"
              @copy="emit('copyMessage', $event)"
              @retry="emit('retryMessage', $event)"
            />
            <template v-if="displayMessages.length <= 1">
              <div class="ml-9.5 flex flex-wrap gap-2 pt-1">
                <Button
                  v-for="suggestion in promptSuggestions"
                  :key="suggestion"
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-auto rounded-lg px-3 py-2 font-normal shadow-none"
                  :disabled="loading || disabled"
                  @click="sendMessage(suggestion)"
                >
                  {{ suggestion }}
                </Button>
                <Button
                  v-if="canRefreshSuggestions"
                  type="button"
                  variant="outline"
                  size="icon"
                  class="rounded-lg shadow-none"
                  :title="t('ai_chat.refresh_suggestions')"
                  :aria-label="t('ai_chat.refresh_suggestions')"
                  :disabled="loading || disabled"
                  @click="emit('refreshSuggestions')"
                >
                  <RefreshCw class="size-3.5" />
                </Button>
              </div>
            </template>
          </div>
        </ScrollArea>
        <Button
          v-if="loading && !autoScrollEnabled"
          type="button"
          variant="secondary"
          size="sm"
          class="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full text-xs shadow-sm"
          @click="resumeAutoScroll"
        >
          <ChevronDown class="size-3.5" />
          {{ t('ai_chat.scroll_to_latest') }}
        </Button>
      </div>

      <div class="p-3 pt-0">
        <AiChatCredentialCard
          v-if="credentialDisclosure"
          :credential="credentialDisclosure"
          @copy="emit('copyCredential', $event)"
          @dismiss="emit('dismissCredential')"
        />
        <AiChatApprovalCard
          v-if="approval"
          :approval="approval"
          :loading="approvalLoading"
          :disabled="disabled"
          @approve="emit('approveConfirmation')"
          @dismiss="emit('dismissConfirmation')"
        />
        <form class="flex items-end gap-2" @submit.prevent="handleSubmit">
          <div class="relative flex-1">
            <Textarea
              v-model="input"
              rows="1"
              :placeholder="inputPlaceholder"
              class="max-h-50 min-h-10 w-full resize-none py-3 pr-12"
              :disabled="loading || disabled"
              @compositionstart="handleCompositionStart"
              @compositionend="handleCompositionEnd"
              @keydown="handleKeydown"
              @paste="handlePaste"
            />
            <Button
              :type="loading ? 'button' : 'submit'"
              size="icon-sm"
              class="absolute right-2 bottom-2"
              :disabled="(!input.trim() && !loading) || disabled"
              :title="loading ? t('ai_chat.stop_generating') : undefined"
              @click="loading ? stopGeneration() : undefined"
            >
              <Square v-if="loading" class="size-3.5 fill-current" />
              <Send v-else class="size-3.5" />
            </Button>
          </div>
        </form>
      </div>
    </div>

    <div v-else class="group relative">
      <div
        v-if="loading"
        class="pointer-events-none absolute -inset-1 rounded-full border border-primary/30"
      />
      <div
        v-if="loading"
        class="pointer-events-none absolute -inset-1 animate-spin rounded-full border-2 border-primary border-t-transparent"
      />

      <Button
        variant="outline"
        :title="assistantTitle"
        @click="openAssistant"
        class="relative z-10 size-14 rounded-full bg-card p-0 text-foreground shadow-md"
      >
        <MessageCircle v-if="!loading" class="size-6" />
        <Sparkles v-else class="size-6 animate-pulse text-primary" />
        <div
          v-if="loading"
          class="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border-2 border-background bg-primary shadow-sm"
        >
          <div class="size-1 rounded-full bg-primary-foreground" />
        </div>
      </Button>
    </div>
  </div>
</template>

<style scoped>
:deep([data-slot='scroll-area-viewport']) {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted-foreground) / 0.2) transparent;
}

:deep([data-slot='scroll-area-viewport']::-webkit-scrollbar) {
  width: 6px;
}

:deep([data-slot='scroll-area-viewport']::-webkit-scrollbar-track) {
  background: transparent;
}

:deep([data-slot='scroll-area-viewport']::-webkit-scrollbar-thumb) {
  background-color: hsl(var(--muted-foreground) / 0.18);
  border-radius: 10px;
}
</style>
