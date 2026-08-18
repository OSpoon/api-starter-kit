<script setup lang="ts">
import {
  Activity,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Copy,
  FileCheck2,
  Gauge,
  ListChecks,
  LoaderCircle,
  RotateCcw,
  Search,
  ShieldCheck,
  User,
} from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { AiChatAgentActivity, AiChatPlanStep, AiChatTimelineItem } from '@/features/ai/api'

import AiMessageContent from './AiMessageContent.vue'

export type AiChatMessageItemStatus = 'pending' | 'streaming' | 'done' | 'error' | 'interrupted'

export interface AiChatMessageItemData {
  id?: string | number
  role: 'assistant' | 'user'
  content: string
  status?: AiChatMessageItemStatus
  activity?: AiChatAgentActivity
  plan?: AiChatPlanStep[]
  timeline?: AiChatTimelineItem[]
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

function localizedOrFallback(key: string, fallback: string) {
  return te(key) ? t(key) : fallback
}

function getMessageContent(content: string) {
  return content.replace(actionMarker, '').trim()
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

function getActivityTarget(activity?: AiChatAgentActivity) {
  if (!activity?.detail) return ''
  if (activity.detail.templateCode) {
    const key = `ai_chat.query_templates.${activity.detail.templateCode}`
    return localizedOrFallback(key, t('ai_chat.query_templates.generic'))
  }
  if (activity.detail.action) {
    const key = `ai_chat.actions.${activity.detail.action}`
    const action = localizedOrFallback(key, t('ai_chat.actions.generic'))
    const target =
      activity.detail.targetLabel ??
      (activity.detail.targetType && activity.detail.targetId
        ? `${localizedOrFallback(
            `ai_chat.target_types.${activity.detail.targetType}`,
            t('ai_chat.target_types.generic')
          )} ${activity.detail.targetId}`
        : '')
    return target ? `${action}：${target}` : action
  }
  if (activity.detail.permissionCode) {
    const key = `ai_chat.permissions.${activity.detail.permissionCode}`
    return localizedOrFallback(key, t('ai_chat.permissions.generic'))
  }
  if (activity.detail.targetType && activity.detail.targetId) {
    const key = `ai_chat.target_types.${activity.detail.targetType}`
    return `${localizedOrFallback(key, t('ai_chat.target_types.generic'))} ${activity.detail.targetId}`
  }
  return ''
}

function getTimelineLabel(item: AiChatTimelineItem) {
  if (item.kind === 'plan') return t('ai_chat.timeline.plan')
  if (item.kind === 'confirmation') return ''
  if (item.kind === 'run') {
    return t('ai_chat.timeline.run', { duration: Math.round(item.durationMs / 1000) })
  }
  const activity = item
  const toolKey = `ai_chat.timeline.tools.${activity.name}`
  const toolLabel = localizedOrFallback(toolKey, t('ai_chat.timeline.tools.generic'))
  const stateKey = `ai_chat.timeline.states.${activity.state}`
  const stateLabel = t(stateKey)
  const target = activity.name === 'run_registered_query' ? getActivityTarget(activity) : ''
  const resultCount =
    typeof activity.detail?.resultCount === 'number'
      ? t('ai_chat.timeline.returned', { count: activity.detail.resultCount })
      : ''
  const detail = target ? `：${target}` : resultCount ? ` · ${resultCount}` : ''
  if (activity.state === 'error' && activity.message) {
    return `${activity.message}${detail}`
  }
  return `${stateLabel}${toolLabel}${detail}`
}

function getTimelineIcon(item: AiChatTimelineItem) {
  if (item.kind === 'plan') return ListChecks
  if (item.kind === 'confirmation') return CircleCheck
  if (item.kind === 'run') return Gauge
  if (item.name === 'run_registered_query') return Search
  if (item.name === 'search_knowledge') return BookOpen
  if (item.name === 'diagnose_my_access') return ShieldCheck
  if (item.name.startsWith('propose_')) return FileCheck2
  if (item.state === 'error') return CircleAlert
  if (item.state === 'running') return LoaderCircle
  return Check
}

function isTimelineActive(item: AiChatTimelineItem) {
  return item.kind === 'tool' && item.state === 'running'
}

function getTimelineSummary(timeline: AiChatTimelineItem[]) {
  const toolCount = timeline.filter((item) => item.kind === 'tool').length
  const planCount = timeline.filter((item) => item.kind === 'plan').length
  const resultCount = timeline.reduce(
    (total, item) =>
      total +
      (item.kind === 'tool' && typeof item.detail?.resultCount === 'number'
        ? item.detail.resultCount
        : 0),
    0
  )
  const parts = []
  if (toolCount > 0) parts.push(t('ai_chat.timeline.tools_count', { count: toolCount }))
  if (planCount > 0) parts.push(t('ai_chat.timeline.steps_count', { count: planCount }))
  if (resultCount > 0) parts.push(t('ai_chat.timeline.results_count', { count: resultCount }))
  return parts.join(' · ')
}

function shouldOpenTimeline(message: AiChatMessageItemData) {
  if (message.status === 'streaming') return true
  return Boolean(
    message.timeline?.some(
      (item) =>
        (item.kind === 'tool' && (item.state === 'running' || item.state === 'error')) ||
        (item.kind === 'tool' && item.name.startsWith('propose_'))
    )
  )
}

function getTimelineSections(timeline: AiChatTimelineItem[]) {
  return [
    {
      key: 'tools',
      label: t('ai_chat.timeline.tools_section'),
      items: timeline.filter((item) => item.kind === 'tool'),
    },
    {
      key: 'plan',
      label: t('ai_chat.timeline.plan_section'),
      items: timeline.filter((item) => item.kind === 'plan'),
    },
    {
      key: 'run',
      label: t('ai_chat.timeline.run_section'),
      items: timeline.filter((item) => item.kind === 'run'),
    },
  ].filter((section) => section.items.length > 0)
}

function getConfirmation(timeline: AiChatTimelineItem[]) {
  return [...timeline].reverse().find((item) => item.kind === 'confirmation')
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
      <details
        v-if="message.role === 'assistant' && message.timeline?.length"
        class="group/timeline mt-1 overflow-hidden rounded-md border border-border/70 bg-muted/20 text-xs"
        :open="shouldOpenTimeline(message)"
      >
        <summary
          class="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-muted-foreground transition-colors hover:bg-muted/50 [&::-webkit-details-marker]:hidden"
        >
          <ChevronRight class="size-3.5 transition-transform group-open/timeline:rotate-90" />
          <Activity class="size-3.5" />
          <span class="font-medium">{{ t('ai_chat.timeline.title') }}</span>
          <span class="ml-auto">{{ getTimelineSummary(message.timeline) }}</span>
        </summary>
        <div class="space-y-3 border-t border-border/60 px-2.5 py-2">
          <div v-for="section in getTimelineSections(message.timeline)" :key="section.key">
            <div
              class="mb-1 px-1.5 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase"
            >
              {{ section.label }}
            </div>
            <div
              v-for="(item, index) in section.items"
              :key="`${item.kind}-${item.kind === 'tool' ? (item.callId ?? item.name) : index}`"
              class="flex items-start gap-2 rounded p-1.5"
              :class="
                isTimelineActive(item) ? 'bg-primary/5 text-foreground' : 'text-muted-foreground'
              "
            >
              <component
                :is="getTimelineIcon(item)"
                class="mt-0.5 size-3.5 shrink-0"
                :class="isTimelineActive(item) ? 'animate-spin text-primary' : ''"
              />
              <span class="min-w-0 flex-1">{{ getTimelineLabel(item) }}</span>
              <span
                v-if="item.kind === 'tool' && item.durationMs"
                class="shrink-0 text-[11px] text-muted-foreground/60 tabular-nums"
              >
                {{ item.durationMs }}ms
              </span>
            </div>
          </div>
        </div>
      </details>
      <div
        v-if="message.role === 'assistant' && message.timeline && getConfirmation(message.timeline)"
        class="my-3 flex items-center gap-2 text-xs text-muted-foreground"
      >
        <div class="h-px flex-1 bg-border/70" />
        <CircleCheck class="size-3.5 text-emerald-600" />
        <span>
          {{
            t('ai_chat.confirmation_separator', {
              action: localizedOrFallback(
                `ai_chat.actions.${getConfirmation(message.timeline)?.action}`,
                t('ai_chat.actions.generic')
              ),
              status: t(
                `ai_chat.confirmation_status.${getConfirmation(message.timeline)?.status ?? 'confirmed'}`
              ),
            })
          }}
        </span>
        <div class="h-px flex-1 bg-border/70" />
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
          :disabled="loading"
          @click="$emit('retry', message)"
        >
          <RotateCcw class="size-3.5" />
        </Button>
      </div>
    </div>
  </div>
</template>
