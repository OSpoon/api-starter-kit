<script setup lang="ts">
import { Bot, Copy, RotateCcw, User } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { AiChatAgentActivity, AiChatPlanStep } from '@/lib/ai-chat-api'

import AiMessageContent from './AiMessageContent.vue'

export type AiChatMessageItemStatus = 'pending' | 'streaming' | 'done' | 'error' | 'interrupted'

export interface AiChatMessageItemData {
  id?: string | number
  role: 'assistant' | 'user'
  content: string
  status?: AiChatMessageItemStatus
  activity?: AiChatAgentActivity
  plan?: AiChatPlanStep[]
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
  const detail =
    activity.detail?.action ??
    activity.detail?.templateCode ??
    activity.detail?.permissionCode ??
    (activity.detail?.targetType && activity.detail?.targetId
      ? `${activity.detail.targetType} ${activity.detail.targetId}`
      : undefined)
  const countSuffix =
    typeof activity.detail?.resultCount === 'number' ? `（${activity.detail.resultCount} 条）` : ''
  const phaseSuffix = activity.phase ? `（${activity.phase}）` : ''
  const suffix = detail ? `：${detail}${countSuffix}${phaseSuffix}` : `${countSuffix}${phaseSuffix}`
  if (activity.state === 'error' && activity.message) {
    return `${activity.message}${suffix}`
  }
  if (activity.state === 'error' && activity.errorCode) {
    return `${t(`ai_chat.errors.${activity.errorCode}`)}${suffix}`
  }
  const key = `ai_chat.activities.${activity.name}.${activity.state}`
  const label = te(key) ? t(key) : t(`ai_chat.activities.generic.${activity.state}`)
  return `${label}${suffix}`
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

function getPlanLabel(step: AiChatPlanStep) {
  return t(`ai_chat.plan.${step.key}.${step.state}`)
}

function getCurrentPlanStep(plan: AiChatPlanStep[]) {
  return (
    [...plan].reverse().find((step) => step.state === 'running') ??
    [...plan].reverse().find((step) => step.state === 'done') ??
    plan[0]!
  )
}

function getActivityTarget(activity?: AiChatAgentActivity) {
  if (!activity?.detail) return ''
  if (activity.detail.templateCode) {
    const key = `ai_chat.query_templates.${activity.detail.templateCode}`
    return te(key) ? t(key) : activity.detail.templateCode
  }
  if (activity.detail.action) {
    const key = `ai_chat.actions.${activity.detail.action}`
    const action = te(key) ? t(key) : activity.detail.action
    const target =
      activity.detail.targetLabel ??
      (activity.detail.targetType && activity.detail.targetId
        ? `${activity.detail.targetType} ${activity.detail.targetId}`
        : '')
    return target ? `${action}：${target}` : action
  }
  if (activity.detail.permissionCode) return activity.detail.permissionCode
  if (activity.detail.targetType && activity.detail.targetId) {
    return `${activity.detail.targetType} ${activity.detail.targetId}`
  }
  return ''
}

function getStatusLabel(message: AiChatMessageItemData) {
  const activity = message.activity
  if (!activity) return ''
  const target = getActivityTarget(activity)
  if (activity.name === 'run_registered_query') {
    const key = `ai_chat.query_status.${activity.state}`
    return `${t(key)}${target ? `：${target}` : ''}`
  }
  if (activity.name === 'search_knowledge') {
    const key = `ai_chat.knowledge_status.${activity.state}`
    return t(key)
  }
  if (message.plan?.length) {
    const planStep = getCurrentPlanStep(message.plan)
    return `${getPlanLabel(planStep)}${target ? `：${target}` : ''}`
  }
  return getActivityLabel(activity)
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
        v-if="message.role === 'assistant' && message.activity && !message.plan?.length"
        class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
      >
        <span v-if="getActivityLabel(message.activity)">
          {{ getActivityLabel(message.activity) }}
        </span>
      </div>
      <div
        v-if="message.role === 'assistant' && message.plan?.length"
        class="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground"
      >
        <span class="font-medium text-foreground">{{ getStatusLabel(message) }}</span>
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
