<script setup lang="ts">
import { Markdown } from '@comark/vue'
import linkify from '@comark/vue/plugins/linkify'
import security from '@comark/vue/plugins/security'
import taskList from '@comark/vue/plugins/task-list'

import { Marker, MarkerContent } from '@/components/ui/marker'

export type AiMessageContentStatus = 'pending' | 'streaming' | 'done' | 'error' | 'interrupted'

const props = withDefaults(
  defineProps<{
    content: string
    status?: AiMessageContentStatus
    streaming?: boolean
    waitingLabel?: string
  }>(),
  {
    status: 'done',
    streaming: false,
  }
)

const { t } = useI18n()
const markdownOptions = { registerDefaultPlugins: false }
const markdownPlugins = [linkify(), security(), taskList()]

const isWaiting = computed(
  () =>
    props.content.trim().length === 0 &&
    (['pending', 'streaming'].includes(props.status) || Boolean(props.waitingLabel))
)
const isStreaming = computed(() => props.streaming || props.status === 'streaming')
const isError = computed(() => props.status === 'error')
</script>

<template>
  <Marker v-if="isWaiting" role="status">
    <MarkerContent :class="{ 'assistant-chat-shimmer': !waitingLabel }">
      {{ waitingLabel || t('ai_chat.waiting') }}
    </MarkerContent>
  </Marker>
  <div v-else class="ai-message-content-markdown" :class="{ 'ai-message-content-error': isError }">
    <Suspense>
      <Markdown
        :value="content"
        :options="markdownOptions"
        :plugins="markdownPlugins"
        :streaming="isStreaming"
        :caret="isStreaming"
      />
      <template #fallback>
        <div class="comark-content">{{ content }}</div>
      </template>
    </Suspense>
  </div>
</template>
