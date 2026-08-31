<script setup lang="ts">
import {
  ArrowUpIcon,
  ChevronDown,
  CircleCheck,
  History,
  ListChecks,
  LoaderCircle,
  MessageCircle,
  MessageCircleDashedIcon,
  MessageCirclePlus,
  Mic,
  Minus,
  Sparkles,
  Square,
  Trash2,
  X,
} from '@lucide/vue'
import { toast } from 'vue-sonner'

import AiChatApprovalCard from '@/components/ai-chat/AiChatApprovalCard.vue'
import AiChatCredentialCard from '@/components/ai-chat/AiChatCredentialCard.vue'
import AiChatMessageItem from '@/components/ai-chat/AiChatMessageItem.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { Textarea } from '@/components/ui/textarea'
import type {
  AiChatConfirmation,
  AiChatCredentialDisclosure,
  AiChatTimelineItem,
} from '@/features/ai/api'
import { useAiChatMessageSelection } from '@/features/ai/composables/useAiChatMessageSelection'
import { useAiChatResize } from '@/features/ai/composables/useAiChatResize'
import type { DisplayAiChatMessage } from '@/features/ai/types'

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
    voiceTranscribing?: boolean
  }>(),
  {
    modelValue: undefined,
    title: undefined,
    placeholder: undefined,
    welcomeMessage: undefined,
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
    voiceTranscribing: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  send: [message: string]
  voiceSend: [audio: Blob, fileName: string]
  clear: []
  selectConversation: [id: string | number]
  deleteConversation: [id: string | number]
  copyMessage: [message: DisplayAiChatMessage]
  copyMessagesAsMarkdown: [messages: DisplayAiChatMessage[]]
  retryMessage: [message: DisplayAiChatMessage]
  stop: []
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
const isRecording = ref(false)
const isPreparingRecording = ref(false)
let mediaRecorder: MediaRecorder | null = null
let recordingChunks: Blob[] = []
let recordingTimeout: ReturnType<typeof setTimeout> | null = null
let discardRecording = false
let audioContext: AudioContext | null = null
let audioAnalyser: AnalyserNode | null = null
let audioSource: MediaStreamAudioSourceNode | null = null
let waveformFrame: number | null = null
let lastWaveformSampleAt = 0

const waveformHeights = ref<number[]>(Array.from({ length: 56 }, () => 8))

const MAX_RECORDING_DURATION_MS = 60_000

function preferredAudioMimeType() {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((type) =>
    MediaRecorder.isTypeSupported(type)
  )
}

function stopWaveform() {
  if (waveformFrame !== null) cancelAnimationFrame(waveformFrame)
  waveformFrame = null
  audioSource?.disconnect()
  audioAnalyser?.disconnect()
  audioSource = null
  audioAnalyser = null
  void audioContext?.close()
  audioContext = null
  lastWaveformSampleAt = 0
  waveformHeights.value = Array.from({ length: 56 }, () => 8)
}

function updateWaveform() {
  if (!audioAnalyser) return
  const now = performance.now()
  if (now - lastWaveformSampleAt >= 50) {
    lastWaveformSampleAt = now
    const values = new Uint8Array(audioAnalyser.fftSize)
    audioAnalyser.getByteTimeDomainData(values)
    const volume = Math.sqrt(
      values.reduce((total, value) => total + (value - 128) ** 2, 0) / values.length
    )
    const peak = Math.min(volume / 18, 1)
    const nextHeight = Math.round(8 + peak * 28)
    waveformHeights.value = [...waveformHeights.value.slice(1), nextHeight]
  }
  waveformFrame = requestAnimationFrame(updateWaveform)
}

function startWaveform(stream: MediaStream) {
  const browserWindow = window as Window & typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
  }
  const AudioContextConstructor = browserWindow.AudioContext || browserWindow.webkitAudioContext
  if (!AudioContextConstructor) return
  audioContext = new AudioContextConstructor()
  audioAnalyser = audioContext.createAnalyser()
  audioAnalyser.fftSize = 256
  audioSource = audioContext.createMediaStreamSource(stream)
  audioSource.connect(audioAnalyser)
  updateWaveform()
}

async function toggleRecording() {
  if (isPreparingRecording.value || props.disabled) return
  if (isRecording.value) {
    mediaRecorder?.stop()
    return
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    toast.error(t('ai_chat.voice.unsupported'))
    return
  }
  isPreparingRecording.value = true
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    startWaveform(stream)
    const mimeType = preferredAudioMimeType()
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    recordingChunks = []
    discardRecording = false
    mediaRecorder.ondataavailable = (event) => event.data.size && recordingChunks.push(event.data)
    mediaRecorder.onstop = () => {
      if (recordingTimeout) {
        clearTimeout(recordingTimeout)
        recordingTimeout = null
      }
      stream.getTracks().forEach((track) => track.stop())
      stopWaveform()
      const blob = new Blob(recordingChunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
      const extension = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'
      if (blob.size > 10 * 1024 * 1024) toast.error(t('ai_chat.voice.too_large'))
      else if (!discardRecording && blob.size) emit('voiceSend', blob, `voice-message.${extension}`)
      isRecording.value = false
      mediaRecorder = null
    }
    mediaRecorder.start()
    isRecording.value = true
    recordingTimeout = setTimeout(() => {
      toast.info(t('ai_chat.voice.max_duration'))
      mediaRecorder?.stop()
    }, MAX_RECORDING_DURATION_MS)
  } catch {
    stopWaveform()
    toast.error(t('ai_chat.voice.permission_denied'))
  } finally {
    isPreparingRecording.value = false
  }
}

function cancelRecording() {
  if (!isRecording.value) return
  discardRecording = true
  mediaRecorder?.stop()
}

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

const { chatHeight, chatWidth, startResize } = useAiChatResize()
const {
  isSelecting: isSelectingMessages,
  selectedKeys: selectedMessageKeys,
  selectableCount: selectableMessageCount,
  selectedMessages,
  getMessageKey,
  start: startMessageSelection,
  cancel: cancelMessageSelection,
  select: selectMessage,
  toggleAll: toggleAllMessages,
  prune: pruneSelectedMessages,
} = useAiChatMessageSelection(displayMessages)

function getConfirmation(timeline?: AiChatTimelineItem[]) {
  return [...(timeline ?? [])].reverse().find((item) => item.kind === 'confirmation')
}

function getConversationBoundaryLabel(message: DisplayAiChatMessage) {
  const confirmation = getConfirmation(message.timeline)
  if (!confirmation || confirmation.kind !== 'confirmation') return ''
  const actionKey = `ai_chat.actions.${confirmation.action}`
  return t('ai_chat.confirmation_separator', {
    action: te(actionKey) ? t(actionKey) : t('ai_chat.actions.generic'),
    status: t(`ai_chat.confirmation_status.${confirmation.status}`),
  })
}

function copySelectedMessagesAsMarkdown() {
  emit('copyMessagesAsMarkdown', selectedMessages.value)
  cancelMessageSelection()
}

function openAssistant() {
  isOpen.value = true
}

function closeAssistant() {
  isOpen.value = false
}

function clearChat() {
  emit('clear')
}

function sendMessage(message = input.value) {
  const content = message.trim()
  if (!content || props.disabled) {
    return
  }

  emit('send', content)
  input.value = ''
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
    pruneSelectedMessages()
  },
  { deep: true }
)
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
            <MessageCircleDashedIcon class="size-4 text-primary" />
          </div>
          <span class="truncate text-sm font-medium">{{ assistantTitle }}</span>
        </div>
        <div class="flex items-center gap-1">
          <Button
            v-if="!isSelectingMessages"
            variant="ghost"
            class="text-muted-foreground"
            size="icon-sm"
            :title="t('ai_chat.select_messages')"
            :aria-label="t('ai_chat.select_messages')"
            :disabled="loading || selectableMessageCount === 0"
            @click="startMessageSelection"
          >
            <ListChecks class="size-4" />
          </Button>
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

      <div
        v-if="isSelectingMessages"
        class="flex items-center gap-2 border-b bg-muted/30 px-4 py-2"
      >
        <Checkbox
          :model-value="
            selectedMessages.length === selectableMessageCount && selectableMessageCount > 0
          "
          :aria-label="t('ai_chat.select_all_messages')"
          @update:model-value="toggleAllMessages($event === true)"
        />
        <span class="min-w-0 flex-1 text-xs text-muted-foreground">
          {{ t('ai_chat.selected_messages', { count: selectedMessages.length }) }}
        </span>
        <Button type="button" variant="ghost" size="sm" @click="cancelMessageSelection">
          {{ t('common.cancel') }}
        </Button>
        <Button
          type="button"
          size="sm"
          :disabled="selectedMessages.length === 0"
          @click="copySelectedMessagesAsMarkdown"
        >
          {{ t('ai_chat.copy_as_markdown') }}
        </Button>
      </div>

      <div class="relative min-h-0 flex-1 p-4">
        <MessageScrollerProvider auto-scroll default-scroll-position="end">
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent class="px-3">
                <template v-for="(message, index) in displayMessages" :key="message.id ?? index">
                  <MessageScrollerItem
                    :message-id="String(message.id ?? index)"
                    :scroll-anchor="message.role === 'user'"
                    class="space-y-3"
                  >
                    <AiChatMessageItem
                      :message="message"
                      :all-messages="displayMessages"
                      :streaming-message-id="streamingMessageId"
                      :loading="loading"
                      :show-message-actions="showMessageActions && !isSelectingMessages"
                      :selectable="isSelectingMessages"
                      :selected="selectedMessageKeys.has(getMessageKey(message, index))"
                      @copy="emit('copyMessage', $event)"
                      @retry="emit('retryMessage', $event)"
                      @select="
                        (selectedMessage, selected) =>
                          selectMessage(selectedMessage, index, selected)
                      "
                    />
                    <div
                      v-if="getConversationBoundaryLabel(message)"
                      class="my-4 flex w-full items-center gap-3 px-2 text-xs text-muted-foreground"
                      role="status"
                    >
                      <div class="h-px flex-1 bg-border/70" />
                      <CircleCheck class="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                      <span class="shrink-0">{{ getConversationBoundaryLabel(message) }}</span>
                      <div class="h-px flex-1 bg-border/70" />
                    </div>
                  </MessageScrollerItem>
                </template>
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton>
              <ChevronDown class="size-3.5" />
              <span class="sr-only">{{ t('ai_chat.scroll_to_latest') }}</span>
            </MessageScrollerButton>
          </MessageScroller>
        </MessageScrollerProvider>
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
        <div
          v-if="isRecording || voiceTranscribing"
          class="flex min-h-10 items-center gap-2 rounded-full border bg-background px-2 py-1.5"
          role="status"
          :aria-label="
            voiceTranscribing ? t('ai_chat.voice.transcribing') : t('ai_chat.voice.recording')
          "
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            class="shrink-0 rounded-full text-muted-foreground"
            :title="t('ai_chat.voice.cancel')"
            :aria-label="t('ai_chat.voice.cancel')"
            :disabled="voiceTranscribing"
            @click="cancelRecording"
          >
            <X class="size-4" />
          </Button>
          <div v-if="voiceTranscribing" class="flex min-w-0 flex-1 items-center justify-center">
            <span class="text-sm text-muted-foreground">{{ t('ai_chat.voice.transcribing') }}</span>
          </div>
          <div v-else class="flex min-w-0 flex-1 items-center justify-center gap-0.5 px-2" aria-hidden="true">
            <span
              v-for="index in 56"
              :key="index"
              class="w-1 rounded-full bg-muted-foreground/25 transition-[height] duration-75"
              :style="{ height: `${waveformHeights[index - 1]}px` }"
            />
          </div>
          <Button
            v-if="isRecording"
            type="button"
            variant="secondary"
            size="icon-sm"
            class="shrink-0 rounded-full"
            :title="t('ai_chat.voice.stop')"
            :aria-label="t('ai_chat.voice.stop')"
            @click="toggleRecording"
          >
            <Square class="size-3.5 fill-current" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            class="shrink-0 rounded-full"
            :disabled="voiceTranscribing"
            :title="voiceTranscribing ? t('ai_chat.voice.transcribing') : t('ai_chat.voice.send')"
            :aria-label="voiceTranscribing ? t('ai_chat.voice.transcribing') : t('ai_chat.voice.send')"
          >
            <LoaderCircle v-if="voiceTranscribing" class="size-3.5 animate-spin" />
            <ArrowUpIcon v-else class="size-3.5" />
          </Button>
        </div>
        <form v-else class="flex items-end gap-2" @submit.prevent="handleSubmit">
          <div class="relative flex-1">
            <Textarea
              v-model="input"
              rows="1"
              :placeholder="inputPlaceholder"
              class="max-h-50 min-h-10 w-full resize-none py-3 pr-12"
              :disabled="disabled"
              @compositionstart="handleCompositionStart"
              @compositionend="handleCompositionEnd"
              @keydown="handleKeydown"
              @paste="handlePaste"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="absolute right-11 bottom-2"
              :class="{ 'text-destructive': isRecording, 'text-primary': isPreparingRecording }"
              :disabled="disabled || loading || isPreparingRecording"
              :title="isRecording ? t('ai_chat.voice.stop') : t('ai_chat.voice.start')"
              :aria-label="isRecording ? t('ai_chat.voice.stop') : t('ai_chat.voice.start')"
              @click="toggleRecording"
            >
              <LoaderCircle v-if="isPreparingRecording" class="size-3.5 animate-spin" />
              <Mic v-else class="size-3.5" />
            </Button>
            <Button
              :type="loading ? 'button' : 'submit'"
              size="icon-sm"
              class="absolute right-2 bottom-2"
              :disabled="(!input.trim() && !loading) || disabled"
              :title="loading ? t('ai_chat.stop_generating') : undefined"
              @click="loading ? stopGeneration() : undefined"
            >
              <Square v-if="loading" class="size-3.5 fill-current" />
              <ArrowUpIcon v-else class="size-3.5" />
            </Button>
          </div>
        </form>
        <p class="mt-2 px-1 text-center text-[11px] leading-4 text-muted-foreground">
          {{ t('ai_chat.response_disclaimer') }}
        </p>
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
