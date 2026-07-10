<script setup lang="ts">
import 'markstream-vue/index.css'

import {
  Bot,
  History,
  MessageCircle,
  MessageCirclePlus,
  Minus,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
} from '@lucide/vue'
import MarkdownRender from 'markstream-vue'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'

type ChatRole = 'assistant' | 'user'

interface ChatMessage {
  id?: string | number
  role: ChatRole
  content: string
}

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
    messages?: ChatMessage[]
    conversations?: ChatConversation[]
    currentConversationId?: string | number | null
    streamingMessageId?: string | number | null
    loading?: boolean
    disabled?: boolean
  }>(),
  {
    modelValue: undefined,
    title: undefined,
    placeholder: undefined,
    welcomeMessage: undefined,
    suggestions: undefined,
    messages: undefined,
    conversations: () => [],
    currentConversationId: null,
    streamingMessageId: null,
    loading: false,
    disabled: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  send: [message: string]
  clear: []
  selectConversation: [id: string | number]
  deleteConversation: [id: string | number]
}>()

const { t } = useI18n()

const internalOpen = ref(false)
const input = ref('')
const isComposingInput = ref(false)
const compositionEndedAt = ref(0)
const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null)

const chatHeight = ref(600)
const isResizing = ref(false)
const resizeStartY = ref(0)
const resizeStartHeight = ref(0)

const internalMessages = ref<ChatMessage[]>([
  {
    id: 'welcome',
    role: 'assistant',
    content: props.welcomeMessage || t('ai_chat.welcome'),
  },
])

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

  return internalMessages.value
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
  resizeStartY.value = event.clientY
  resizeStartHeight.value = chatHeight.value
  window.addEventListener('mousemove', onResize)
  window.addEventListener('mouseup', stopResize)
  document.body.style.userSelect = 'none'
}

function onResize(event: MouseEvent) {
  if (!isResizing.value) {
    return
  }

  const delta = resizeStartY.value - event.clientY
  const nextHeight = resizeStartHeight.value + delta
  chatHeight.value = Math.min(Math.max(nextHeight, 420), window.innerHeight - 32)
}

function stopResize() {
  isResizing.value = false
  window.removeEventListener('mousemove', onResize)
  window.removeEventListener('mouseup', stopResize)
  document.body.style.userSelect = ''
}

function scrollToBottom() {
  nextTick(() => {
    const root = scrollAreaRef.value?.$el as HTMLElement | undefined
    const viewport = root?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  })
}

function openAssistant() {
  isOpen.value = true
  scrollToBottom()
}

function closeAssistant() {
  isOpen.value = false
}

function clearChat() {
  if (!props.messages) {
    internalMessages.value = [
      {
        id: 'welcome',
        role: 'assistant',
        content: welcomeMessage.value,
      },
    ]
  }

  emit('clear')
  scrollToBottom()
}

function appendLocalResponse(message: string) {
  if (props.messages) {
    return
  }

  internalMessages.value.push(
    {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
    },
    {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: t('ai_chat.demo_response'),
    }
  )
}

function sendMessage(message = input.value) {
  const content = message.trim()
  if (!content || props.loading || props.disabled) {
    return
  }

  appendLocalResponse(content)
  emit('send', content)
  input.value = ''
  scrollToBottom()
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

function isPendingAssistantMessage(message: ChatMessage) {
  return (
    message.role === 'assistant' &&
    message.content.trim().length === 0 &&
    (message.id === props.streamingMessageId || props.loading)
  )
}

function isStreamingAssistantMessage(message: ChatMessage) {
  return message.role === 'assistant' && message.id === props.streamingMessageId
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
    scrollToBottom()
  }
})

onUnmounted(() => {
  stopResize()
})
</script>

<template>
  <div class="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
    <div
      v-if="isOpen"
      class="relative flex w-[520px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-lg animate-in fade-in slide-in-from-bottom-5"
      :style="{ height: `${chatHeight}px` }"
    >
      <div
        class="group absolute top-0 right-0 left-0 z-50 flex h-1.5 w-full cursor-ns-resize items-center justify-center transition-colors hover:bg-muted"
        @mousedown.prevent="startResize"
      >
        <div
          class="h-1 w-12 rounded-full bg-border transition-colors group-hover:bg-muted-foreground/30"
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
            size="icon"
            class="size-7 text-muted-foreground hover:text-foreground"
            :title="t('ai_chat.new_chat')"
            @click="clearChat"
          >
            <MessageCirclePlus class="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="size-7 text-muted-foreground hover:text-foreground"
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
                  size="icon"
                  class="size-6 shrink-0 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
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
            size="icon"
            class="size-7 text-muted-foreground hover:text-foreground"
            :title="t('ai_chat.minimize')"
            @click="closeAssistant"
          >
            <Minus class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-7 text-muted-foreground hover:text-foreground"
            :title="t('common.cancel')"
            @click="closeAssistant"
          >
            <X class="size-4" />
          </Button>
        </div>
      </div>

      <div class="flex-1 min-h-0 p-4">
        <ScrollArea ref="scrollAreaRef" class="h-full">
          <div class="space-y-3 pr-3">
            <div
              v-for="(message, index) in displayMessages"
              :key="message.id ?? index"
              class="flex gap-2.5 text-[13px] leading-5"
              :class="message.role === 'user' ? 'flex-row-reverse' : ''"
            >
              <div
                class="flex size-7 shrink-0 items-center justify-center rounded-full"
                :class="
                  message.role === 'user'
                    ? 'bg-accent text-accent-foreground'
                    : 'border bg-background text-muted-foreground'
                "
              >
                <User v-if="message.role === 'user'" class="size-3.5" />
                <Bot v-else class="size-3.5" />
              </div>
              <div
                class="max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-5"
                :class="
                  message.role === 'user'
                    ? 'bg-accent text-accent-foreground'
                    : 'ai-chat-markdown border bg-background text-foreground'
                "
              >
                <div v-if="isPendingAssistantMessage(message)" class="ai-chat-typing">
                  <span>{{ t('ai_chat.waiting') }}</span>
                </div>
                <MarkdownRender
                  v-else-if="message.role === 'assistant'"
                  custom-id="ai-chat"
                  mode="chat"
                  :content="message.content"
                  :final="!isStreamingAssistantMessage(message)"
                  :smooth-streaming="isStreamingAssistantMessage(message) ? 'auto' : false"
                  :fade="!isStreamingAssistantMessage(message)"
                  :typewriter="isStreamingAssistantMessage(message)"
                  :max-live-nodes="isStreamingAssistantMessage(message) ? 0 : undefined"
                  :batch-rendering="isStreamingAssistantMessage(message)"
                  :render-batch-size="16"
                  :render-batch-delay="8"
                  :render-batch-budget-ms="4"
                />
                <template v-else>
                  {{ message.content }}
                </template>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      <div v-if="displayMessages.length <= 1" class="flex flex-wrap gap-2 px-3 pb-2">
        <Button
          v-for="suggestion in promptSuggestions"
          :key="suggestion"
          type="button"
          variant="secondary"
          size="sm"
          class="h-7 rounded-md px-3 text-xs"
          :disabled="loading || disabled"
          @click="sendMessage(suggestion)"
        >
          {{ suggestion }}
        </Button>
      </div>

      <div class="p-3 pt-0">
        <form class="flex items-end gap-2" @submit.prevent="handleSubmit">
          <div class="relative flex-1">
            <Textarea
              v-model="input"
              rows="1"
              :placeholder="inputPlaceholder"
              class="min-h-10 max-h-[200px] w-full resize-none py-3 pr-12"
              :disabled="loading || disabled"
              @compositionstart="handleCompositionStart"
              @compositionend="handleCompositionEnd"
              @keydown="handleKeydown"
              @paste="handlePaste"
            />
            <Button
              type="submit"
              size="icon"
              class="absolute right-2 bottom-2 size-7 rounded-md"
              :disabled="!input.trim() || loading || disabled"
            >
              <div
                v-if="loading"
                class="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/80 border-t-transparent"
              />
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
        size="lg"
        class="relative z-10 size-14 rounded-full border bg-card p-0 text-foreground shadow-md transition-colors hover:bg-accent hover:text-accent-foreground"
        :title="assistantTitle"
        @click="openAssistant"
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

.ai-chat-markdown {
  font-size: 13px;
  line-height: 1.5;
}

.ai-chat-typing {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 1.25rem;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  line-height: 1;
}

.ai-chat-typing span {
  white-space: nowrap;
}

.ai-chat-markdown :deep(.markstream-vue) {
  --ms-text-body: 13px;
  --ms-leading-body: 1.5;
  --ms-text-h1: 0.95rem;
  --ms-text-h2: 0.925rem;
  --ms-text-h3: 0.9rem;
  --ms-text-h4: 0.875rem;
  --ms-text-h5: 0.875rem;
  --ms-text-h6: 0.875rem;
  --ms-leading-h1: 1.3;
  --ms-leading-h2: 1.35;
  --ms-leading-h3: 1.4;
  --ms-flow-paragraph-y: 0.375rem;
  --ms-flow-list-y: 0.375rem;
  --ms-flow-list-item-y: 0.125rem;
  --ms-flow-list-indent: 1.125rem;
  --ms-flow-list-indent-mobile: 1.125rem;
  --ms-flow-table-y: 0.5rem;
  --ms-flow-blockquote-y: 0.5rem;
  --ms-flow-codeblock-y: 0.5rem;
  --ms-flow-heading-1-mt: 0;
  --ms-flow-heading-1-mb: 0.375rem;
  --ms-flow-heading-2-mt: 0.625rem;
  --ms-flow-heading-2-mb: 0.375rem;
  --ms-flow-heading-3-mt: 0.5rem;
  --ms-flow-heading-3-mb: 0.25rem;
  --ms-flow-heading-4-mt: 0.5rem;
  --ms-flow-heading-4-mb: 0.25rem;
  --ms-inset-panel-body: 0.625rem;
  --ms-inset-panel-x: 0.5rem;
  --ms-inset-panel-y: 0.25rem;
  --ms-gap-header: 0.5rem;
  --ms-gap-header-main: 0.375rem;
  --ms-gap-header-actions: 0.375rem;
  --ms-action-btn-icon: 0.75rem;
  --ms-action-btn-padding: 0.25rem;
  --ms-size-code-max-height: 240px;
  --vscode-editor-font-size: 12px;
  --vscode-editor-line-height: 1.45;
  font-size: 13px;
  line-height: 1.5;
  color: inherit;
}

.ai-chat-markdown :deep(.markstream-vue .text-node),
.ai-chat-markdown :deep(.markstream-vue .paragraph-node),
.ai-chat-markdown :deep(.markstream-vue .list-node),
.ai-chat-markdown :deep(.markstream-vue .list-item-node) {
  font-size: 13px;
  line-height: 1.5;
}

.ai-chat-markdown :deep(.markstream-vue .leading-relaxed) {
  line-height: 1.5;
}

.ai-chat-markdown :deep(.markstream-vue > * + *) {
  margin-top: 0.375rem;
}

.ai-chat-markdown :deep(p) {
  margin: 0;
}

.ai-chat-markdown :deep(p + p) {
  margin-top: 0.375rem;
}

.ai-chat-markdown :deep(ul),
.ai-chat-markdown :deep(ol) {
  margin: 0.375rem 0 0;
  padding-left: 1.125rem;
}

.ai-chat-markdown :deep(li) {
  margin: 0.125rem 0;
}

.ai-chat-markdown :deep(h1),
.ai-chat-markdown :deep(h2),
.ai-chat-markdown :deep(h3),
.ai-chat-markdown :deep(h4),
.ai-chat-markdown :deep(h5),
.ai-chat-markdown :deep(h6) {
  margin: 0.625rem 0 0.375rem;
  font-size: 0.95rem;
  line-height: 1.35;
  font-weight: 600;
}

.ai-chat-markdown :deep(pre) {
  margin: 0.5rem 0 0;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 0.375rem;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--muted) / 0.35);
  padding: 0.625rem;
  font-size: 0.75rem;
  line-height: 1.45;
}

.ai-chat-markdown :deep(code) {
  border-radius: 0.25rem;
  background: hsl(var(--muted) / 0.45);
  padding: 0.08rem 0.25rem;
  font-size: 0.78rem;
}

.ai-chat-markdown :deep(pre code) {
  background: transparent;
  padding: 0;
  font-size: inherit;
}

.ai-chat-markdown :deep(blockquote) {
  margin: 0.5rem 0 0;
  border-left: 2px solid hsl(var(--border));
  padding-left: 0.625rem;
  color: hsl(var(--muted-foreground));
}

.ai-chat-markdown :deep(table) {
  margin-top: 0.5rem;
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
}

.ai-chat-markdown :deep(th),
.ai-chat-markdown :deep(td) {
  border: 1px solid hsl(var(--border));
  padding: 0.25rem 0.375rem;
}
</style>
