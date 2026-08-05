<script setup lang="ts">
import 'markstream-vue/index.css'

import MarkdownRender from 'markstream-vue'

export type AiMessageContentStatus = 'pending' | 'streaming' | 'done' | 'error' | 'interrupted'

const props = withDefaults(
  defineProps<{
    content: string
    status?: AiMessageContentStatus
    streaming?: boolean
  }>(),
  {
    status: 'done',
    streaming: false,
  }
)

const { t } = useI18n()

const isPending = computed(() => props.status === 'pending' && props.content.trim().length === 0)
const isStreaming = computed(() => props.streaming || props.status === 'streaming')
const isError = computed(() => props.status === 'error')
</script>

<template>
  <div v-if="isPending" class="ai-message-content-waiting">
    <span>{{ t('ai_chat.waiting') }}</span>
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

<style scoped>
.ai-message-content-markdown {
  font-size: 14px;
  line-height: 1.5;
}

.ai-message-content-waiting {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 1.25rem;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1;
}

.ai-message-content-error {
  color: var(--destructive);
}

.ai-message-content-waiting span {
  white-space: nowrap;
}

.ai-message-content-markdown :deep(.markstream-vue) {
  --ms-text-body: 14px;
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
  font-size: 14px;
  line-height: 1.5;
  color: inherit;
}

.ai-message-content-markdown :deep(.markstream-vue .text-node),
.ai-message-content-markdown :deep(.markstream-vue .paragraph-node),
.ai-message-content-markdown :deep(.markstream-vue .list-node),
.ai-message-content-markdown :deep(.markstream-vue .list-item-node) {
  font-size: 14px;
  line-height: 1.5;
}

.ai-message-content-markdown :deep(.markstream-vue .leading-relaxed) {
  line-height: 1.5;
}

.ai-message-content-markdown :deep(.markstream-vue > * + *) {
  margin-top: 0.375rem;
}

.ai-message-content-markdown :deep(p) {
  margin: 0;
}

.ai-message-content-markdown :deep(p + p) {
  margin-top: 0.375rem;
}

.ai-message-content-markdown :deep(ul),
.ai-message-content-markdown :deep(ol) {
  margin: 0.375rem 0 0;
  padding-left: 1.125rem;
}

.ai-message-content-markdown :deep(li) {
  margin: 0.125rem 0;
}

.ai-message-content-markdown :deep(h1),
.ai-message-content-markdown :deep(h2),
.ai-message-content-markdown :deep(h3),
.ai-message-content-markdown :deep(h4),
.ai-message-content-markdown :deep(h5),
.ai-message-content-markdown :deep(h6) {
  margin: 0.625rem 0 0.375rem;
  font-size: 0.95rem;
  line-height: 1.35;
  font-weight: 600;
}

.ai-message-content-markdown :deep(pre) {
  margin: 0.5rem 0 0;
  max-width: 100%;
  overflow-x: auto;
  border-radius: 0.375rem;
  border: 1px solid var(--border);
  background: color-mix(in oklab, var(--muted) 35%, transparent);
  padding: 0.625rem;
  font-size: 0.75rem;
  line-height: 1.45;
}

.ai-message-content-markdown :deep(code) {
  border-radius: 0.25rem;
  background: color-mix(in oklab, var(--muted) 45%, transparent);
  padding: 0.08rem 0.25rem;
  font-size: 0.78rem;
}

.ai-message-content-markdown :deep(pre code) {
  background: transparent;
  padding: 0;
  font-size: inherit;
}

.ai-message-content-markdown :deep(blockquote) {
  margin: 0.5rem 0 0;
  border-left: 2px solid var(--border);
  padding-left: 0.625rem;
  color: var(--muted-foreground);
}

.ai-message-content-markdown :deep(table) {
  margin-top: 0.5rem;
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
}

.ai-message-content-markdown :deep(th),
.ai-message-content-markdown :deep(td) {
  border: 1px solid var(--border);
  padding: 0.25rem 0.375rem;
}
</style>
