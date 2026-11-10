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
  X,
} from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  type AiChatAgentActivity,
  type AiChatPlanStep,
  type AiChatTimelineItem,
  getAiChatMessageImage,
} from '@/features/ai/api'
import { useAuthStore } from '@/stores/auth'

import AiChatLogo from './AiChatLogo.vue'
import AiMessageContent from './AiMessageContent.vue'

export type AiChatMessageItemStatus = 'pending' | 'streaming' | 'done' | 'error' | 'interrupted'

export interface AiChatMessageItemData {
  id?: string | number
  conversationId?: number
  role: 'assistant' | 'user'
  content: string
  image?: { mimeType: string }
  localImageFile?: File
  candidateContent?: string
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
const auth = useAuthStore()
const timelineOpen = ref(false)
const imageSource = ref<string | null>(null)
const imageLoadFailed = ref(false)
const imagePreviewOpen = ref(false)

watch(
  () =>
    [
      props.message.conversationId,
      props.message.id,
      props.message.image?.mimeType,
      props.message.localImageFile,
      auth.token,
    ] as const,
  async ([conversationId, messageId], _previous, onCleanup) => {
    imageSource.value = null
    imageLoadFailed.value = false
    if (props.message.localImageFile) {
      const objectUrl = URL.createObjectURL(props.message.localImageFile)
      imageSource.value = objectUrl
      onCleanup(() => URL.revokeObjectURL(objectUrl))
      return
    }
    if (!props.message.image || !conversationId || !Number.isSafeInteger(Number(messageId))) return

    const controller = new AbortController()
    let objectUrl: string | undefined
    onCleanup(() => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    })

    try {
      const image = await getAiChatMessageImage(
        auth.token,
        conversationId,
        Number(messageId),
        controller.signal
      )
      objectUrl = URL.createObjectURL(image)
      imageSource.value = objectUrl
    } catch {
      if (!controller.signal.aborted) imageLoadFailed.value = true
    }
  },
  { immediate: true }
)

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

function getRenderedMessageContent(message: AiChatMessageItemData) {
  const content = getMessageContent(message)
  const candidateContent = message.role === 'assistant' ? (message.candidateContent ?? '') : ''
  return content ? `${content}${candidateContent}` : candidateContent.trimStart()
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
    if (item.name === 'model_response') {
      if (item.outcome === 'tool_call') {
        return t('ai_chat.timeline.phases.model_response.tool_call')
      }
      return t(`ai_chat.timeline.phases.model_response.${item.state}`)
    }
    return t(`ai_chat.timeline.phases.preparing_agent.${item.state}`)
  }
  if (item.kind === 'plan') {
    return item.steps.map(getPlanStepLabel).join(' · ')
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
  if (item.kind === 'model_text') return item.text
  const activity = item
  const toolKey = `ai_chat.timeline.tools.${activity.name}`
  const awaitingConfirmation = activity.phase === 'awaiting_confirmation'
  const cancelledConfirmation = activity.phase === 'cancelled'
  const awaitingConfirmedTool = awaitingConfirmation && activity.detail?.toolName
  const actionKey = `ai_chat.actions.${activity.detail?.action ?? ''}`
  const actionLabel = activity.detail?.action
    ? localizedOrFallback(actionKey, activity.detail.action)
    : localizedOrFallback(toolKey, t('ai_chat.timeline.tools.generic'))
  const confirmedToolName =
    activity.name === 'confirmation_execution' ? activity.detail?.toolName : undefined
  const toolNotRegistered = activity.errorCode === 'tool_not_registered'
  const toolLabel =
    toolNotRegistered && !activity.displayName
      ? t('ai_chat.timeline.tool_not_registered')
      : cancelledConfirmation
        ? t('ai_chat.timeline.tools.action_cancelled', { action: actionLabel })
        : activity.displayName
          ? activity.displayName
          : activity.detail?.skillCode
            ? t('ai_chat.timeline.tools.skill_named', {
                name: activity.detail.skillName ?? activity.detail.skillCode,
              })
            : confirmedToolName
              ? t('ai_chat.timeline.tools.confirmation_execution_with_tool', {
                  toolName: confirmedToolName,
                })
              : awaitingConfirmedTool
                ? t('ai_chat.timeline.tools.confirmation_execution_with_tool', {
                    toolName: activity.detail?.toolName,
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
    : activity.state === 'error' && activity.message && !awaitingConfirmation
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
  if (item.kind === 'model_text') return item.streaming ? LoaderCircle : Activity
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
  return step.label ?? t(`ai_chat.plan.${step.key}.${step.state}`)
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
      item.kind === 'plan' &&
      (item.planType ?? 'confirmation') === 'confirmation' &&
      item.steps.some((step) => step.key === 'await_confirmation')
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
  if (item.kind === 'model_text') return Boolean(item.streaming)
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
  if (!message.status || message.status === 'done') return false
  if (message.timeline?.some((item) => item.kind === 'tool' || item.kind === 'model_text')) {
    return true
  }
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

watch(
  () => [props.message.status, props.message.timeline] as const,
  () => {
    if (shouldOpenTimeline(props.message)) timelineOpen.value = true
    else if (!props.message.status || props.message.status === 'done') timelineOpen.value = false
  },
  { immediate: true }
)

function updateTimelineOpen(event: Event) {
  timelineOpen.value = (event.currentTarget as HTMLDetailsElement).open
}

function getTimelineSections(timeline: AiChatTimelineItem[]) {
  const turns = new Map<number, AiChatTimelineItem[]>()
  let currentTurn = 0
  for (const item of timeline) {
    if (item.kind === 'phase' && item.name === 'preparing_agent') {
      currentTurn += 1
      if (item.state === 'done') continue
    }
    if (item.kind === 'confirmation') continue
    if (item.kind === 'run' && props.message.status === 'streaming') continue
    const turn = item.kind === 'plan' && item.turn ? item.turn : Math.max(currentTurn, 1)
    const items = turns.get(turn) ?? []
    items.push(item)
    turns.set(turn, items)
  }
  return [...turns].map(([turn, items]) => ({
    key: `turn-${turn}`,
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
          getRenderedMessageContent(message) ||
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
          :content="getRenderedMessageContent(message)"
          :status="message.status ?? 'done'"
          :streaming="message.status === 'streaming' || message.id === streamingMessageId"
          :waiting-label="
            isAwaitingConfirmation(message) ? t('ai_chat.waiting_for_confirmation') : undefined
          "
        />
        <template v-else>
          <button
            v-if="imageSource"
            type="button"
            class="mb-2 block max-w-full cursor-zoom-in rounded-md focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="t('ai_chat.image.open_preview')"
            @click="imagePreviewOpen = true"
          >
            <img
              :src="imageSource"
              :alt="t('ai_chat.image.preview')"
              class="max-h-60 max-w-full rounded-md object-contain sm:max-w-[320px]"
            />
          </button>
          <p v-else-if="imageLoadFailed" class="mb-2 text-xs text-muted-foreground" role="status">
            {{ t('ai_chat.image.load_failed') }}
          </p>
          <p class="whitespace-pre-wrap">{{ message.content }}</p>
        </template>
      </div>
      <Dialog v-model:open="imagePreviewOpen">
        <DialogContent class="max-h-[90vh] max-w-[85vw] p-3 sm:max-w-xl" :show-close-button="false">
          <DialogClose as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="absolute top-1 right-1 z-10"
              :title="t('common.cancel')"
              :aria-label="t('common.cancel')"
            >
              <X class="size-4" aria-hidden="true" />
            </Button>
          </DialogClose>
          <DialogTitle class="sr-only">{{ t('ai_chat.image.preview') }}</DialogTitle>
          <img
            v-if="imageSource"
            :src="imageSource"
            :alt="t('ai_chat.image.preview')"
            class="max-h-[82vh] max-w-full object-contain"
          />
        </DialogContent>
      </Dialog>
      <details
        v-if="
          message.role === 'assistant' &&
          message.timeline?.length &&
          getTimelineSections(message.timeline).length
        "
        class="group/timeline mt-1 overflow-hidden rounded-md bg-muted/20 text-xs"
        :open="timelineOpen"
        @toggle="updateTimelineOpen"
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
                  <span class="min-w-0 flex-1 truncate" :title="getPlanStepLabel(step)">
                    {{ getPlanStepLabel(step) }}
                  </span>
                  <span
                    v-if="getPlanStepDurationMs(step) !== undefined"
                    class="shrink-0 text-xs text-muted-foreground tabular-nums"
                  >
                    {{ getPlanStepDurationLabel(step) }}
                  </span>
                </div>
              </div>
              <div v-else-if="item.kind === 'model_text'" class="min-w-0 flex-1">
                <p class="break-words whitespace-pre-wrap">{{ item.text }}</p>
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
                <span class="shrink-0">{{
                  getMergedToolStatusLabel(item, getConfirmationPlanForTool(item, section.items)!)
                }}</span>
                <span
                  class="min-w-0 flex-1 truncate text-muted-foreground"
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
                <div class="min-w-0 flex-1">
                  <span
                    class="block truncate"
                    :title="getTimelineLabel(item, message.timeline ?? [])"
                  >
                    {{ getTimelineLabel(item, message.timeline ?? []) }}
                  </span>
                  <pre
                    v-if="item.kind === 'tool' && item.detail?.inputPreview"
                    class="mt-1 font-sans break-words whitespace-pre-wrap text-muted-foreground"
                    >{{ item.detail.inputPreview }}</pre
                  >
                  <pre
                    v-if="item.kind === 'tool' && item.detail?.outputPreview"
                    class="mt-1 rounded bg-background/70 p-1.5 font-mono break-words whitespace-pre-wrap text-muted-foreground"
                    >{{ item.detail.outputPreview }}</pre
                  >
                </div>
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
