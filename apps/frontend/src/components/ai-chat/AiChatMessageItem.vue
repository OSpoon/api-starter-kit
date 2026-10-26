<script setup lang="ts">
import {
  Activity,
  BookOpen,
  Check,
  ChevronRight,
  Circle,
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
} from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { AiChatAgentActivity, AiChatPlanStep, AiChatTimelineItem } from '@/features/ai/api'

import AiChatLogo from './AiChatLogo.vue'
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
    currentTime?: number
    loading?: boolean
    showMessageActions?: boolean
    selectable?: boolean
    selected?: boolean
  }>(),
  {
    allMessages: undefined,
    streamingMessageId: null,
    currentTime: undefined,
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
const legacyConfirmationNotice = '此操作需要确认，请在确认卡片中确认后继续。'

const isWelcomeMessage = computed(() => props.message.id === 'welcome')

function formatDurationSeconds(durationMs: number) {
  if (durationMs > 0 && durationMs < 100) return '<0.1'
  return String(Math.round(durationMs / 100) / 10)
}

function localizedOrFallback(key: string, fallback: string) {
  return te(key) ? t(key) : fallback
}

function hasConfirmation(message: AiChatMessageItemData) {
  return Boolean(
    message.timeline?.some(
      (item) =>
        item.kind === 'confirmation' ||
        (item.kind === 'tool' &&
          ['awaiting_confirmation', 'cancelled', 'confirmed', 'failed', 'expired'].includes(
            item.phase ?? ''
          ))
    )
  )
}

function isAwaitingConfirmation(message: AiChatMessageItemData) {
  return message.timeline?.some(
    (item) => item.kind === 'tool' && item.phase === 'awaiting_confirmation'
  )
}

function getMessageContent(message: AiChatMessageItemData) {
  let content = message.content.replace(actionMarker, '')
  if (message.role === 'assistant' && hasConfirmation(message)) {
    content = content.replaceAll(legacyConfirmationNotice, '')
  }
  return content.trim()
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

function getTimelineLabel(item: AiChatTimelineItem, timeline: AiChatTimelineItem[] = []) {
  if (item.kind === 'phase') {
    if (item.name === 'mcp_discovery') {
      return t(`ai_chat.timeline.phases.mcp_discovery.${item.state}`, {
        serverName: item.serverName ?? t('ai_chat.timeline.phases.unknown_server'),
        toolCount: item.toolCount ?? item.tools?.length ?? 0,
        enabledToolCount: item.tools?.filter((tool) => tool.mode).length ?? 0,
      })
    }
    if (item.name === 'model_response') {
      return t(`ai_chat.timeline.phases.model_response.${item.state}`)
    }
    return t(`ai_chat.timeline.phases.preparing_agent.${item.state}`)
  }
  if (item.kind === 'plan') {
    return item.steps.map((step) => t(`ai_chat.plan.${step.key}.${step.state}`)).join(' · ')
  }
  if (item.kind === 'confirmation') return ''
  if (item.kind === 'run') {
    const awaitingConfirmation = timeline.some(
      (entry) => entry.kind === 'tool' && entry.phase === 'awaiting_confirmation'
    )
    return t(
      awaitingConfirmation ? 'ai_chat.timeline.run_waiting_confirmation' : 'ai_chat.timeline.run',
      { duration: formatDurationSeconds(item.durationMs) }
    )
  }
  const activity = item
  const toolKey = `ai_chat.timeline.tools.${activity.name}`
  const awaitingConfirmation = activity.phase === 'awaiting_confirmation'
  const cancelledConfirmation = activity.phase === 'cancelled'
  const awaitingMcpTool = awaitingConfirmation && activity.detail?.toolName
  const actionKey = `ai_chat.actions.${activity.detail?.action ?? ''}`
  const actionLabel = activity.detail?.action
    ? localizedOrFallback(actionKey, activity.detail.action)
    : localizedOrFallback(toolKey, t('ai_chat.timeline.tools.generic'))
  const confirmedToolName =
    activity.detail?.toolName &&
    (activity.name === 'confirmation_execution' || activity.name.startsWith('mcp_'))
      ? activity.detail.toolName
      : undefined
  const toolNotRegistered =
    activity.errorCode === 'tool_not_registered' ||
    (activity.name.startsWith('mcp_') && activity.message === `Tool ${activity.name} not found`)
  const toolLabel =
    toolNotRegistered && !activity.displayName
      ? t('ai_chat.timeline.tools.unregistered_mcp')
      : cancelledConfirmation
        ? t('ai_chat.timeline.tools.action_cancelled', { action: actionLabel })
        : activity.displayName
          ? t('ai_chat.timeline.tools.mcp_tool_named', { name: activity.displayName })
          : activity.detail?.skillCode
            ? t('ai_chat.timeline.tools.skill_named', {
                name: activity.detail.skillName ?? activity.detail.skillCode,
              })
            : confirmedToolName
              ? t('ai_chat.timeline.tools.confirmation_execution_with_tool', {
                  toolName: confirmedToolName,
                })
              : awaitingMcpTool
                ? t('ai_chat.timeline.tools.mcp_tool_named', {
                    name: activity.displayName ?? activity.detail?.toolName,
                  })
                : awaitingConfirmation
                  ? actionLabel
                  : localizedOrFallback(
                      toolKey,
                      activity.name || t('ai_chat.timeline.tools.generic')
                    )
  const stateKey = `ai_chat.timeline.states.${activity.state}`
  const stateLabel =
    awaitingConfirmation || cancelledConfirmation
      ? ''
      : t(activity.errorCode ? 'ai_chat.timeline.states.error' : stateKey)
  const errorMessage = toolNotRegistered
    ? t('ai_chat.timeline.error_reason_separator', {
        message: t('ai_chat.timeline.tool_not_registered'),
      })
    : activity.message && !awaitingConfirmation
      ? t('ai_chat.timeline.error_reason_separator', { message: activity.message })
      : ''
  if (activity.displayName && !awaitingConfirmation && !cancelledConfirmation) {
    return `${stateLabel.trim()} ${activity.displayName}${errorMessage}`.trim()
  }
  return `${stateLabel}${toolLabel}${errorMessage}`
}

function getTimelineIcon(item: AiChatTimelineItem) {
  if (item.kind === 'phase') {
    if (item.state === 'error') return CircleAlert
    return item.state === 'running' ? LoaderCircle : Check
  }
  if (item.kind === 'plan') return ListChecks
  if (item.kind === 'confirmation') return CircleCheck
  if (item.kind === 'run') return Gauge
  if (item.name === 'run_registered_query') return Search
  if (item.name === 'search_knowledge_catalog' || item.name === 'search_knowledge') return BookOpen
  if (item.name === 'diagnose_my_access') return ShieldCheck
  if (item.name.startsWith('propose_')) return FileCheck2
  if (item.state === 'error') return CircleAlert
  if (item.state === 'running') return LoaderCircle
  return Check
}

function getPlanStepIcon(step: AiChatPlanStep) {
  if (step.state === 'running') return LoaderCircle
  if (step.state === 'done') return Check
  return Circle
}

function getPlanStepDurationMs(step: AiChatPlanStep) {
  if (step.state === 'running' && step.startedAt !== undefined) {
    return Math.max(0, (props.currentTime ?? Date.now()) - step.startedAt)
  }
  return step.durationMs
}

function getPlanStepDurationLabel(step: AiChatPlanStep) {
  const durationMs = getPlanStepDurationMs(step)
  if (durationMs === undefined) return ''
  if (step.state === 'running') {
    return t('ai_chat.timeline.elapsed', { duration: formatDurationSeconds(durationMs) })
  }
  return t('ai_chat.timeline.duration_seconds', { duration: formatDurationSeconds(durationMs) })
}

function getPlanStepLabel(step: AiChatPlanStep) {
  return t(`ai_chat.plan.${step.key}.${step.state}`)
}

function getConfirmationPlanForTool(
  tool: AiChatTimelineItem,
  items: AiChatTimelineItem[]
): Extract<AiChatTimelineItem, { kind: 'plan' }> | undefined {
  if (
    tool.kind !== 'tool' ||
    !tool.displayName ||
    !['preparing_action', 'awaiting_confirmation', 'executing_confirmation', 'confirmed'].includes(
      tool.phase ?? ''
    )
  ) {
    return undefined
  }
  return items.find(
    (item): item is Extract<AiChatTimelineItem, { kind: 'plan' }> =>
      item.kind === 'plan' && item.steps.some((step) => step.key === 'await_confirmation')
  )
}

function isPlanMergedWithTool(plan: AiChatTimelineItem, items: AiChatTimelineItem[]) {
  return (
    plan.kind === 'plan' && items.some((item) => getConfirmationPlanForTool(item, items) === plan)
  )
}

function getMergedToolStatusLabel(
  tool: Extract<AiChatTimelineItem, { kind: 'tool' }>,
  plan: Extract<AiChatTimelineItem, { kind: 'plan' }>
) {
  if (tool.phase === 'awaiting_confirmation') {
    return t('ai_chat.plan.await_confirmation.running')
  }
  if (tool.phase === 'executing_confirmation') {
    return t('ai_chat.timeline.merged_tool.executing')
  }
  if (tool.phase === 'cancelled') return t('ai_chat.timeline.merged_tool.cancelled')
  if (tool.state === 'error') {
    return `${t('ai_chat.timeline.states.error')}${tool.message ? t('ai_chat.timeline.error_reason_separator', { message: tool.message }) : ''}`
  }
  if (tool.phase === 'confirmed') return t('ai_chat.timeline.states.done').trim()
  const runningStep = plan.steps.find((step) => step.state === 'running')
  return runningStep
    ? getPlanStepLabel(runningStep)
    : t(`ai_chat.timeline.states.${tool.state}`).trim()
}

function getMergedToolIcon(tool: Extract<AiChatTimelineItem, { kind: 'tool' }>) {
  if (tool.state === 'error') return CircleAlert
  if (tool.phase === 'awaiting_confirmation' || tool.phase === 'executing_confirmation') {
    return LoaderCircle
  }
  if (tool.phase === 'cancelled') return Circle
  return tool.state === 'running' ? LoaderCircle : Check
}

function getMergedToolDurationLabel(
  tool: Extract<AiChatTimelineItem, { kind: 'tool' }>,
  plan: Extract<AiChatTimelineItem, { kind: 'plan' }>
) {
  if (tool.phase === 'awaiting_confirmation') {
    const step = plan.steps.find(
      (item) => item.key === 'await_confirmation' && item.state === 'running'
    )
    return step ? getPlanStepDurationLabel(step) : getTimelineDurationLabel(tool)
  }
  return getTimelineDurationLabel(tool)
}

function isMergedToolActive(tool: Extract<AiChatTimelineItem, { kind: 'tool' }>) {
  return (
    tool.state === 'running' ||
    tool.phase === 'awaiting_confirmation' ||
    tool.phase === 'executing_confirmation'
  )
}

function isTimelineActive(item: AiChatTimelineItem) {
  return (item.kind === 'tool' || item.kind === 'phase') && item.state === 'running'
}

function getTimelineDurationMs(item: AiChatTimelineItem) {
  if (item.kind !== 'tool' && item.kind !== 'phase') return undefined
  if (item.state === 'running' && item.startedAt !== undefined) {
    return Math.max(0, (props.currentTime ?? Date.now()) - item.startedAt)
  }
  return item.durationMs
}

function getTimelineDurationLabel(item: AiChatTimelineItem) {
  const durationMs = getTimelineDurationMs(item)
  if (durationMs === undefined) return ''
  if ((item.kind === 'tool' || item.kind === 'phase') && item.state === 'running') {
    return t('ai_chat.timeline.elapsed', { duration: formatDurationSeconds(durationMs) })
  }
  return t('ai_chat.timeline.duration_seconds', { duration: formatDurationSeconds(durationMs) })
}

const timelineScrollArea = ref<HTMLDivElement>()

watch(
  () => [props.message.status, props.message.timeline] as const,
  ([status, timeline]) => {
    if (status !== 'streaming' && !timeline?.some(isTimelineActive)) return
    nextTick(() => {
      const element = timelineScrollArea.value
      if (element) element.scrollTop = element.scrollHeight
    })
  },
  { deep: true, flush: 'post', immediate: true }
)

function getTimelineSummary(timeline: AiChatTimelineItem[]) {
  const toolCount = timeline.filter((item) => item.kind === 'tool').length
  const planCount = timeline.reduce(
    (total, item) => total + (item.kind === 'plan' ? item.steps.length : 0),
    0
  )
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
  if (message.status === 'pending' && message.timeline?.some((item) => item.kind === 'phase')) {
    return true
  }
  return Boolean(
    message.timeline?.some(
      (item) =>
        (item.kind === 'tool' && (item.state === 'running' || item.state === 'error')) ||
        (item.kind === 'phase' && item.state === 'running') ||
        (item.kind === 'tool' && item.name.startsWith('propose_'))
    )
  )
}

function getTimelineSections(timeline: AiChatTimelineItem[]) {
  const turns = new Map<number, AiChatTimelineItem[]>()
  let currentTurn = 0
  for (const item of timeline) {
    if (item.kind === 'phase' && item.name === 'preparing_agent') currentTurn += 1
    if (item.kind === 'confirmation') continue
    if (item.kind === 'run' && props.message.status === 'streaming') continue
    if (item.kind === 'phase' && item.name === 'mcp_discovery' && item.state !== 'error') continue
    const turn = item.kind === 'plan' && item.turn ? item.turn : Math.max(currentTurn, 1)
    const items = turns.get(turn) ?? []
    items.push(item)
    turns.set(turn, items)
  }
  return [...turns].map(([turn, items]) => ({
    key: `turn-${turn}`,
    label: t('ai_chat.timeline.turn_section', { turn }),
    items,
  }))
}
</script>

<template>
  <div
    class="flex gap-2.5 text-sm/5"
    :class="[
      message.role === 'user' ? 'flex-row-reverse' : '',
      isWelcomeMessage ? 'justify-center' : '',
    ]"
  >
    <Checkbox
      v-if="selectable && message.id !== 'welcome' && getMessageContent(message)"
      :model-value="selected"
      :aria-label="t('ai_chat.select_message')"
      class="mt-1.5"
      @update:model-value="$emit('select', message, $event === true)"
    />
    <div
      class="group/message flex max-w-[85%] min-w-0 flex-col gap-1"
      :class="message.role === 'assistant' ? 'w-full' : ''"
    >
      <div
        v-if="
          isWelcomeMessage ||
          message.role === 'user' ||
          getMessageContent(message) ||
          ((message.status === 'pending' || message.status === 'streaming') &&
            !getMessageContent(message)) ||
          (isAwaitingConfirmation(message) && !getMessageContent(message))
        "
        class="rounded-lg px-3 py-2 text-sm/5 whitespace-pre-wrap"
        :class="
          message.role === 'user'
            ? 'bg-accent text-accent-foreground'
            : isWelcomeMessage
              ? 'px-0 py-0 text-center'
              : 'bg-background text-foreground dark:bg-input/30'
        "
      >
        <div
          v-if="isWelcomeMessage"
          class="flex flex-col items-center gap-1.5 px-4 pt-10 pb-4 text-center"
        >
          <span class="mb-1.5 size-12 shrink-0" aria-hidden="true">
            <AiChatLogo />
          </span>
          <p class="text-base font-semibold text-primary">{{ t('ai_chat.welcome_title') }}</p>
          <p class="text-xs/5 text-muted-foreground">{{ t('ai_chat.welcome_subtitle') }}</p>
        </div>
        <AiMessageContent
          v-else-if="message.role === 'assistant'"
          :content="getMessageContent(message)"
          :status="message.status ?? 'done'"
          :streaming="message.status === 'streaming' || message.id === streamingMessageId"
          :waiting-label="
            isAwaitingConfirmation(message) ? t('ai_chat.waiting_for_confirmation') : undefined
          "
        />
        <template v-else>
          {{ message.content }}
        </template>
      </div>
      <details
        v-if="message.role === 'assistant' && message.timeline?.length"
        class="group/timeline mt-1 overflow-hidden rounded-md bg-muted/20 text-xs"
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
        <div
          ref="timelineScrollArea"
          class="max-h-[180px] space-y-3 overflow-y-auto overscroll-contain border-t border-border/60 px-2.5 py-2"
        >
          <div v-for="section in getTimelineSections(message.timeline)" :key="section.key">
            <div
              class="mb-1 px-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            >
              {{ section.label }}
            </div>
            <div
              v-for="(item, index) in section.items"
              :key="`${item.kind}-${item.kind === 'tool' ? (item.callId ?? item.name) : index}`"
              v-show="item.kind !== 'plan' || !isPlanMergedWithTool(item, section.items)"
              class="flex items-start gap-2 rounded px-1.5 py-0.5"
              :class="
                isTimelineActive(item) || (item.kind === 'tool' && isMergedToolActive(item))
                  ? 'bg-primary/5 text-foreground'
                  : 'text-muted-foreground'
              "
            >
              <div v-if="item.kind === 'plan'" class="min-w-0 flex-1 space-y-1">
                <div
                  v-for="step in item.steps"
                  :key="step.key"
                  class="flex items-start gap-2"
                  :class="step.state === 'running' ? 'text-foreground' : 'text-muted-foreground'"
                >
                  <component
                    :is="getPlanStepIcon(step)"
                    class="mt-0.5 size-3.5 shrink-0"
                    :class="step.state === 'running' ? 'animate-spin text-primary' : ''"
                    aria-hidden="true"
                  />
                  <span class="min-w-0 flex-1">{{ getPlanStepLabel(step) }}</span>
                  <span
                    v-if="getPlanStepDurationMs(step) !== undefined"
                    class="shrink-0 text-xs text-muted-foreground tabular-nums"
                  >
                    {{ getPlanStepDurationLabel(step) }}
                  </span>
                </div>
              </div>
              <template
                v-else-if="item.kind === 'tool' && getConfirmationPlanForTool(item, section.items)"
              >
                <component
                  :is="getMergedToolIcon(item)"
                  class="mt-0.5 size-3.5 shrink-0"
                  :class="isMergedToolActive(item) ? 'animate-spin text-primary' : ''"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1">{{
                  getMergedToolStatusLabel(item, getConfirmationPlanForTool(item, section.items)!)
                }}</span>
                <span
                  class="max-w-[45%] min-w-0 truncate text-right text-muted-foreground"
                  :title="item.displayName ?? item.detail?.toolName"
                >
                  {{ item.displayName ?? item.detail?.toolName }}
                </span>
                <span
                  v-if="
                    getMergedToolDurationLabel(
                      item,
                      getConfirmationPlanForTool(item, section.items)!
                    )
                  "
                  class="shrink-0 text-xs text-muted-foreground tabular-nums"
                >
                  {{
                    getMergedToolDurationLabel(
                      item,
                      getConfirmationPlanForTool(item, section.items)!
                    )
                  }}
                </span>
              </template>
              <template v-else>
                <component
                  :is="getTimelineIcon(item)"
                  class="mt-0.5 size-3.5 shrink-0"
                  :class="isTimelineActive(item) ? 'animate-spin text-primary' : ''"
                />
                <span class="min-w-0 flex-1">{{
                  getTimelineLabel(item, message.timeline ?? [])
                }}</span>
                <span
                  v-if="getTimelineDurationMs(item) !== undefined"
                  class="shrink-0 text-xs text-muted-foreground tabular-nums"
                >
                  {{ getTimelineDurationLabel(item) }}
                </span>
              </template>
            </div>
          </div>
        </div>
      </details>
      <div
        v-if="showMessageActions && message.id !== 'welcome' && getMessageContent(message)"
        class="relative z-10 flex h-8 items-center gap-1 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100"
        :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground"
          :title="t('ai_chat.copy_message')"
          @click="$emit('copy', { ...message, content: getMessageContent(message) })"
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
