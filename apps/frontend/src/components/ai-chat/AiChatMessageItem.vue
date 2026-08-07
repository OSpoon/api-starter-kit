<script setup lang="ts">
import { Bot, Copy, RotateCcw, User } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { AiChatAgentActivity } from '@/lib/ai-chat-api'

import AiMessageContent from './AiMessageContent.vue'

export type AiChatMessageItemStatus = 'pending' | 'streaming' | 'done' | 'error' | 'interrupted'

export interface AiChatMessageItemData {
  id?: string | number
  role: 'assistant' | 'user'
  content: string
  status?: AiChatMessageItemStatus
  activity?: AiChatAgentActivity
}

const props = withDefaults(
  defineProps<{
    message: AiChatMessageItemData
    allMessages?: AiChatMessageItemData[]
    streamingMessageId?: string | number | null
    loading?: boolean
    showMessageActions?: boolean
    selectable?: boolean
    selected?: boolean
  }>(),
  {
    allMessages: undefined,
    streamingMessageId: null,
    loading: false,
    showMessageActions: true,
    selectable: false,
    selected: false,
  }
)

defineEmits<{
  copy: [message: AiChatMessageItemData]
  retry: [message: AiChatMessageItemData]
  select: [message: AiChatMessageItemData, selected: boolean]
}>()

const { t, te } = useI18n()

const actionMarker = /\[\[action:([A-Za-z0-9_-]+)\]\]/g

function getMessageContent(content: string) {
  return content.replace(actionMarker, '').trim()
}

function getActivityLabel(activity: AiChatAgentActivity) {
  if (activity.state === 'error' && activity.message) {
    return activity.message
  }
  const key = `ai_chat.activities.${activity.name}.${activity.state}`
  return te(key) ? t(key) : t(`ai_chat.activities.generic.${activity.state}`)
}

function canRetryMessage(message: AiChatMessageItemData) {
  const messages = props.allMessages ?? [message]
  const latestAssistantMessage = [...messages].reverse().find((item) => item.role === 'assistant')

  return (
    props.showMessageActions &&
    message.role === 'assistant' &&
    message.id === latestAssistantMessage?.id &&
    Number.isInteger(Number(message.id)) &&
    message.id !== props.streamingMessageId &&
    message.id !== 'welcome'
  )
}
</script>

<template>
  <div class="flex gap-2.5 text-sm/5" :class="message.role === 'user' ? 'flex-row-reverse' : ''">
    <Checkbox
      v-if="selectable && message.id !== 'welcome' && message.content.trim()"
      :model-value="selected"
      :aria-label="t('ai_chat.select_message')"
      class="mt-1.5"
      @update:model-value="$emit('select', message, $event === true)"
    />
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
        class="rounded-lg px-3 py-2 text-sm/5 whitespace-pre-wrap"
        :class="
          message.role === 'user'
            ? 'bg-accent text-accent-foreground'
            : 'border bg-background text-foreground dark:bg-input/30'
        "
      >
        <AiMessageContent
          v-if="message.role === 'assistant'"
          :content="getMessageContent(message.content)"
          :status="message.status ?? 'done'"
          :streaming="message.status === 'streaming' || message.id === streamingMessageId"
        />
        <template v-else>
          {{ message.content }}
        </template>
      </div>
      <div
        v-if="message.role === 'assistant' && message.activity"
        class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
      >
        <span v-if="getActivityLabel(message.activity)">
          {{ getActivityLabel(message.activity) }}
        </span>
      </div>
      <div
        v-if="showMessageActions && message.id !== 'welcome' && message.content.trim().length > 0"
        class="flex h-6 items-center gap-1 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100"
        :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground"
          :title="t('ai_chat.copy_message')"
          @click="$emit('copy', message)"
        >
          <Copy class="size-3.5" />
        </Button>
        <Button
          v-if="canRetryMessage(message)"
          type="button"
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground"
          :title="t('ai_chat.retry_message')"
          :disabled="loading || loading"
          @click="$emit('retry', message)"
        >
          <RotateCcw class="size-3.5" />
        </Button>
      </div>
    </div>
  </div>
</template>
