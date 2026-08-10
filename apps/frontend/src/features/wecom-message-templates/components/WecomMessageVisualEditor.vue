<script setup lang="ts">
import 'markstream-vue/index.css'

import { Eye } from '@lucide/vue'
import MarkdownRender, { setCustomComponents } from 'markstream-vue'
import { defineComponent, h } from 'vue'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import type { WecomMessageType } from '../types'

const props = defineProps<{ msgtype: WecomMessageType; modelValue: Record<string, unknown> }>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, unknown>] }>()
const { t } = useI18n()
const previewOpen = ref(false)
const body = computed(() => (props.modelValue[props.msgtype] ?? {}) as Record<string, unknown>)
const previewCustomId = 'wecom-template-preview'
const previewFontTag = 'wecom-font'
const previewMentionTag = 'wecom-mention'
const supportedFontColors = new Set(['info', 'comment', 'warning'])

const WecomFontNode = defineComponent({
  props: { color: { type: String, default: 'info' } },
  setup(fontProps, { slots }) {
    return () => {
      const color = supportedFontColors.has(fontProps.color) ? fontProps.color : 'info'
      return h('span', { class: 'wecom-font-' + color }, slots.default?.())
    }
  },
})

const WecomMentionNode = defineComponent({
  props: { userId: { type: String, default: '' } },
  setup(mentionProps) {
    return () =>
      h('span', { class: 'wecom-mention', title: mentionProps.userId }, `@${mentionProps.userId}`)
  },
})

setCustomComponents(previewCustomId, {
  [previewFontTag]: WecomFontNode,
  [previewMentionTag]: WecomMentionNode,
})

const markdownPreviewContent = computed(() => {
  const content = String(body.value.content ?? '').replaceAll('\\n', '\n')
  if (props.msgtype !== 'markdown') return content

  return content
    .replace(/<font\s+color=["'](info|comment|warning)["']\s*>/gi, '<wecom-font color="$1">')
    .replace(/<\/font>/gi, '</wecom-font>')
    .replace(/<@\{\{\s*([\w.-]+)\s*\}\}>/g, '<wecom-mention user-id="{{$1}}"></wecom-mention>')
    .replace(/<@([\w.-]+)>/g, '<wecom-mention user-id="$1"></wecom-mention>')
})

const contentByteLimit = computed(() => (props.msgtype === 'text' ? 2048 : 4096))
const contentByteLength = computed(
  () => new TextEncoder().encode(String(body.value.content ?? '')).length
)

function updateContent(value: string) {
  emit('update:modelValue', {
    ...props.modelValue,
    [props.msgtype]: { ...body.value, content: value },
  })
}
</script>

<template>
  <div class="min-w-0 space-y-2">
    <template v-if="msgtype === 'markdown' || msgtype === 'markdown_v2'">
      <div class="min-w-0 space-y-1">
        <div class="flex items-center justify-between gap-3">
          <Label for="wecom-visual-content">{{ t('wecom_templates.markdown_edit') }}</Label>
        </div>
        <Textarea
          id="wecom-visual-content"
          :model-value="String(body.content ?? '')"
          class="max-h-72 min-h-36 resize-y overflow-y-auto font-mono"
          @update:model-value="updateContent(String($event))"
        />
      </div>
      <Dialog v-model:open="previewOpen">
        <DialogContent class="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{{ t('wecom_templates.markdown_preview') }}</DialogTitle>
            <DialogDescription>{{ t('wecom_templates.preview_desc') }}</DialogDescription>
          </DialogHeader>
          <div
            class="wecom-markdown-preview max-h-[60vh] overflow-y-auto rounded-md border bg-muted/20 px-3 py-2"
          >
            <MarkdownRender
              :custom-id="previewCustomId"
              mode="chat"
              :content="markdownPreviewContent"
              :final="true"
              :custom-html-tags="[previewFontTag, previewMentionTag]"
              html-policy="safe"
            />
          </div>
        </DialogContent>
      </Dialog>
    </template>
    <template v-else>
      <Label for="wecom-visual-content">{{ t('wecom_templates.visual_content') }}</Label>
      <Textarea
        id="wecom-visual-content"
        :model-value="String(body.content ?? '')"
        class="max-h-72 min-h-36 resize-y overflow-y-auto"
        @update:model-value="updateContent(String($event))"
      />
    </template>
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <p class="text-xs text-muted-foreground">{{ t('wecom_templates.visual_content_hint') }}</p>
      <div class="flex items-center gap-2">
        <p
          class="text-xs"
          :class="
            contentByteLength > contentByteLimit ? 'text-destructive' : 'text-muted-foreground'
          "
        >
          {{
            t('wecom_templates.content_bytes', {
              current: contentByteLength,
              max: contentByteLimit,
            })
          }}
        </p>
        <Button
          v-if="msgtype === 'markdown' || msgtype === 'markdown_v2'"
          type="button"
          variant="ghost"
          size="icon-sm"
          :aria-label="t('wecom_templates.markdown_preview')"
          :title="t('wecom_templates.markdown_preview')"
          @click="previewOpen = true"
        >
          <Eye class="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.wecom-font-info) {
  color: #1bc42c;
}

:deep(.wecom-font-comment) {
  color: #909093;
}

:deep(.wecom-font-warning) {
  color: #faa801;
}

:deep(.wecom-mention) {
  color: var(--primary);
  font-weight: 600;
}

.wecom-markdown-preview {
  font-size: 1rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.wecom-markdown-preview :deep(p),
.wecom-markdown-preview :deep(ul),
.wecom-markdown-preview :deep(ol),
.wecom-markdown-preview :deep(blockquote),
.wecom-markdown-preview :deep(pre),
.wecom-markdown-preview :deep(table) {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

.wecom-markdown-preview :deep(p:first-child),
.wecom-markdown-preview :deep(h1:first-child),
.wecom-markdown-preview :deep(h2:first-child),
.wecom-markdown-preview :deep(h3:first-child) {
  margin-top: 0;
}

.wecom-markdown-preview :deep(h1),
.wecom-markdown-preview :deep(h2),
.wecom-markdown-preview :deep(h3),
.wecom-markdown-preview :deep(h4),
.wecom-markdown-preview :deep(h5),
.wecom-markdown-preview :deep(h6) {
  margin-top: 0.5rem;
  margin-bottom: 0.25rem;
  font-size: 1rem;
  line-height: 1.5;
}

.wecom-markdown-preview :deep(blockquote) {
  padding-left: 0.75rem;
}
</style>
