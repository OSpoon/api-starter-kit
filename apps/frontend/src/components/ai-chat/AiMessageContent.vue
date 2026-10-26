<script setup lang="ts">
import 'markstream-vue/index.css'

import MarkdownRender from 'markstream-vue'

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

const isWaiting = computed(
  () =>
    props.content.trim().length === 0 &&
    (['pending', 'streaming'].includes(props.status) || Boolean(props.waitingLabel))
)
const isStreaming = computed(() => props.streaming || props.status === 'streaming')
const isError = computed(() => props.status === 'error')
</script>

<template>
  <div v-if="isWaiting" class="ai-message-content-waiting">
    <span>{{ waitingLabel || t('ai_chat.waiting') }}</span>
  </div>
  <div v-else class="ai-message-content-markdown" :class="{ 'ai-message-content-error': isError }">
    <MarkdownRender
      custom-id="ai-chat"
      mode="chat"
      :content="content"
      :final="!isStreaming"
      :smooth-streaming="isStreaming ? 'auto' : false"
      :fade="!isStreaming"
      :typewriter="isStreaming"
      :max-live-nodes="isStreaming ? 0 : undefined"
      :batch-rendering="isStreaming"
      :render-batch-size="16"
      :render-batch-delay="8"
      :render-batch-budget-ms="4"
      html-policy="escape"
    />
  </div>
</template>
