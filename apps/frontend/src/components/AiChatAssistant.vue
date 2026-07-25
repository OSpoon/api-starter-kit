<script setup lang="ts">
import {
  Bot,
  ChevronDown,
  Copy,
  History,
  MessageCircle,
  MessageCirclePlus,
  Minus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  User,
  X,
} from '@lucide/vue'

import AiMessageContent, {
  type AiMessageContentStatus,
} from '@/components/ai-chat/AiMessageContent.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import type {
  AiChatAgentActivity,
  AiChatCitation,
  AiChatClientAction,
  AiChatConfirmation,
  AiChatCredentialDisclosure,
} from '@/lib/ai-chat-api'
import { formatDateTime } from '@/lib/format'

type ChatRole = 'assistant' | 'user'
type ChatMessageStatus = AiMessageContentStatus

interface ChatMessage {
  id?: string | number
  role: ChatRole
  content: string
  status?: ChatMessageStatus
  activity?: AiChatAgentActivity
  citations?: AiChatCitation[]
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
    canRefreshSuggestions?: boolean
    messages?: ChatMessage[]
    conversations?: ChatConversation[]
    currentConversationId?: string | number | null
    streamingMessageId?: string | number | null
    loading?: boolean
    disabled?: boolean
    showMessageActions?: boolean
    actions?: AiChatClientAction[]
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
    actions: () => [],
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
  copyMessage: [message: ChatMessage]
  retryMessage: [message: ChatMessage]
  stop: []
  runAction: [action: AiChatClientAction]
  refreshSuggestions: []
  approveConfirmation: []
  dismissConfirmation: []
  dismissCredential: []
  copyCredential: [credential: AiChatCredentialDisclosure]
}>()

const { t, te } = useI18n()

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

function isStreamingAssistantMessage(message: ChatMessage) {
  return (
    message.role === 'assistant' &&
    (message.status === 'streaming' || message.id === props.streamingMessageId)
  )
}

function getAssistantMessageStatus(message: ChatMessage): ChatMessageStatus {
  if (message.status) {
    return message.status
  }

  if (
    message.role === 'assistant' &&
    message.content.trim().length === 0 &&
    (message.id === props.streamingMessageId || props.loading)
  ) {
    return 'pending'
  }

  if (isStreamingAssistantMessage(message)) {
    return 'streaming'
  }

  return 'done'
}

function getActivityLabel(activity: AiChatAgentActivity) {
  if (activity.state === 'error' && activity.message) {
    return activity.message
  }
  const key = `ai_chat.activities.${activity.name}.${activity.state}`
  return te(key) ? t(key) : t(`ai_chat.activities.generic.${activity.state}`)
}

function getMessageActivityLabel(message: ChatMessage) {
  if (message.activity) return getActivityLabel(message.activity)
  return message.citations?.length ? t('ai_chat.activities.search_knowledge.done') : null
}

function getCitationDocumentTitles(citations: AiChatCitation[]) {
  return [...new Map(citations.map((citation) => [citation.documentId, citation.title])).values()]
}

function getApprovalTarget(approval: AiChatConfirmation) {
  const summary = approval.targetSummary
  const name = summary.name
  if (typeof name === 'string') return name

  const fullName = summary.fullName
  if (typeof fullName === 'string') return fullName

  const code = summary.code
  return typeof code === 'string' ? code : approval.targetId
}

function getApprovalActionLabel(approval: AiChatConfirmation) {
  const key = `ai_chat.approval.actions.${approval.action}`
  return te(key) ? t(key) : t('ai_chat.approval.actions.generic')
}

function getChangeFieldLabel(field: string) {
  const key = `ai_chat.approval.change_fields.${field}`
  return te(key) ? t(key) : field
}

function getChangeValue(value: string) {
  const key = `ai_chat.approval.change_values.${value}`
  return te(key) ? t(key) : value
}

function isDestructiveApproval(approval: AiChatConfirmation) {
  return /^(revoke_|delete_|disable_|reset_)/.test(approval.action)
}

function canCopyMessage(message: ChatMessage) {
  return props.showMessageActions && message.id !== 'welcome' && message.content.trim().length > 0
}

function canRetryMessage(message: ChatMessage) {
  const latestAssistantMessage = [...displayMessages.value]
    .reverse()
    .find((item) => item.role === 'assistant')

  return (
    props.showMessageActions &&
    message.role === 'assistant' &&
    message.id === latestAssistantMessage?.id &&
    Number.isInteger(Number(message.id)) &&
    !isStreamingAssistantMessage(message) &&
    message.id !== 'welcome'
  )
}

const actionMarker = /\[\[action:([A-Za-z0-9_-]+)\]\]/g

function getMessageContent(content: string) {
  return content.replace(actionMarker, '').trim()
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
      class="relative flex w-130 max-w-[calc(100vw-32px)] animate-in flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-lg slide-in-from-bottom-5 fade-in"
      :style="{ height: `${chatHeight}px` }"
    >
      <div
        class="group absolute inset-x-0 top-0 z-50 flex h-1.5 w-full cursor-ns-resize items-center justify-center transition-colors hover:bg-muted"
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
            class="size-7 text-muted-foreground"
            size="icon"
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
                class="size-7 text-muted-foreground"
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
                  class="size-6 shrink-0 text-muted-foreground"
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
            class="size-7 text-muted-foreground"
            :title="t('ai_chat.minimize')"
            @click="closeAssistant"
          >
            <Minus class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-7 text-muted-foreground"
            :title="t('common.cancel')"
            @click="closeAssistant"
          >
            <X class="size-4" />
          </Button>
        </div>
      </div>

      <div class="min-h-0 flex-1 p-4">
        <ScrollArea ref="scrollAreaRef" class="h-full">
          <div class="space-y-3 pr-3">
            <div
              v-for="(message, index) in displayMessages"
              :key="message.id ?? index"
              class="flex gap-2.5 text-[13px]/5"
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
              <div class="group/message flex max-w-[85%] flex-col gap-1">
                <div
                  class="rounded-lg px-3 py-2 text-[13px]/5 whitespace-pre-wrap"
                  :class="
                    message.role === 'user'
                      ? 'bg-accent text-accent-foreground'
                      : 'border bg-background text-foreground'
                  "
                >
                  <AiMessageContent
                    v-if="message.role === 'assistant'"
                    :content="getMessageContent(message.content)"
                    :status="getAssistantMessageStatus(message)"
                    :streaming="isStreamingAssistantMessage(message)"
                  />
                  <template v-else>
                    {{ message.content }}
                  </template>
                </div>
                <div
                  v-if="message.role === 'assistant' && (message.activity || message.citations?.length)"
                  class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
                >
                  <span v-if="getMessageActivityLabel(message)">
                    {{ getMessageActivityLabel(message) }}
                  </span>
                  <DropdownMenu v-if="message.citations?.length">
                    <DropdownMenuTrigger as-child>
                      <Button
                        type="button"
                        variant="ghost"
                        class="h-auto gap-1 p-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                      >
                        {{
                          t('ai_chat.citations.title', {
                            count: getCitationDocumentTitles(message.citations).length,
                          })
                        }}
                        <ChevronDown class="size-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" :side-offset="6" class="w-56 p-1">
                      <DropdownMenuItem
                        v-for="title in getCitationDocumentTitles(message.citations)"
                        :key="title"
                        class="cursor-default text-xs"
                        @select.prevent
                      >
                        {{ title }}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div
                  v-if="canCopyMessage(message) || canRetryMessage(message)"
                  class="flex h-6 items-center gap-1 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100"
                  :class="
                    message.role === 'user'
                      ? 'justify-end'
                      : `
                    justify-start
                  `
                  "
                >
                  <Button
                    v-if="canCopyMessage(message)"
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="size-6 text-muted-foreground"
                    :title="t('ai_chat.copy_message')"
                    @click="emit('copyMessage', message)"
                  >
                    <Copy class="size-3.5" />
                  </Button>
                  <Button
                    v-if="canRetryMessage(message)"
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="size-6 text-muted-foreground"
                    :title="t('ai_chat.retry_message')"
                    :disabled="loading || disabled"
                    @click="emit('retryMessage', message)"
                  >
                    <RotateCcw class="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
            <div v-if="displayMessages.length <= 1" class="ml-[2.375rem] flex flex-wrap gap-2 pt-1">
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
              <Button
                v-if="canRefreshSuggestions"
                type="button"
                variant="ghost"
                size="icon"
                class="size-7 text-muted-foreground"
                :title="t('ai_chat.refresh_suggestions')"
                :aria-label="t('ai_chat.refresh_suggestions')"
                :disabled="loading || disabled"
                @click="emit('refreshSuggestions')"
              >
                <RefreshCw class="size-3.5" />
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>

      <div class="p-3 pt-0">
        <div
          v-if="credentialDisclosure"
          class="mb-2 rounded-md border bg-muted/60 px-2.5 py-2 text-xs"
        >
          <p class="font-medium">{{ credentialDisclosure.label }}</p>
          <code class="mt-1 block break-all">{{ credentialDisclosure.value }}</code>
          <div class="mt-1 flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              class="h-7 px-2"
              @click="emit('copyCredential', credentialDisclosure)"
            >
              <Copy class="size-3.5" />
              {{ t('ai_chat.credential.copy') }}
            </Button>
            <Button size="sm" variant="ghost" class="h-7 px-2" @click="emit('dismissCredential')">
              {{ t('common.close') }}
            </Button>
          </div>
        </div>
        <div v-if="approval" class="mb-2 rounded-md border bg-muted/60 px-2.5 py-2 text-xs">
          <div class="flex items-start gap-2">
            <ShieldCheck class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div class="min-w-0 flex-1 space-y-1">
              <p class="font-medium text-foreground">
                {{ getApprovalActionLabel(approval) }}
              </p>
              <p class="break-words text-muted-foreground">
                {{ t('ai_chat.approval.target', { target: getApprovalTarget(approval) }) }}
              </p>
              <dl v-if="approval.changeSummary.length" class="space-y-1 text-muted-foreground">
                <div
                  v-for="change in approval.changeSummary"
                  :key="change.field"
                  class="flex gap-1"
                >
                  <dt class="shrink-0">{{ getChangeFieldLabel(change.field) }}:</dt>
                  <dd class="break-all">{{ getChangeValue(change.value) }}</dd>
                </div>
              </dl>
              <p class="text-muted-foreground">
                {{
                  isDestructiveApproval(approval)
                    ? t('ai_chat.approval.destructive_impact')
                    : t('ai_chat.approval.standard_impact')
                }}
              </p>
              <p v-if="approval.expiresAt" class="text-muted-foreground">
                {{
                  t('ai_chat.approval.expires_at', {
                    time: formatDateTime(approval.expiresAt),
                  })
                }}
              </p>
            </div>
          </div>
          <div class="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              class="h-7 px-2 text-xs"
              :disabled="approvalLoading || disabled"
              @click="emit('dismissConfirmation')"
            >
              {{ t('ai_chat.approval.cancel') }}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              class="h-7 px-2 text-xs"
              :disabled="approvalLoading || disabled"
              @click="emit('approveConfirmation')"
            >
              {{ approvalLoading ? t('common.loading') : t('ai_chat.approval.approve') }}
            </Button>
          </div>
        </div>
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
              size="icon"
              class="absolute right-2 bottom-2 size-7 rounded-md"
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
</style>
