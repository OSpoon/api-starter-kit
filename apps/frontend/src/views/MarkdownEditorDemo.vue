<script setup lang="ts">
import 'bytemd/dist/index.css'

import { Editor as ByteMDEditor } from 'bytemd'
import zhHans from 'bytemd/locales/zh_Hans.json'
import { toast } from 'vue-sonner'

import PageShell from '@/components/common/PageShell.vue'
import { uploadMediaImage } from '@/features/media/api'
import { usePermission } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { t, locale } = useI18n()
const { can } = usePermission()
const markdown = ref(
  `# Markdown\n\n在左侧编辑 Markdown，在右侧查看预览。\n\n- 支持基础 Markdown 语法\n- 可从工具栏上传图片\n\n> 图片最多 2 MB，支持 JPEG、PNG 和 WebP。`
)
const canUploadImages = computed(() => can('media:upload'))
const editorLocale = computed(() => (locale.value.startsWith('zh') ? zhHans : undefined))
const editorRoot = ref<HTMLDivElement | null>(null)
let editor: InstanceType<typeof ByteMDEditor> | null = null

onMounted(() => {
  if (!editorRoot.value) return

  editor = new ByteMDEditor({
    target: editorRoot.value,
    props: {
      value: markdown.value,
      locale: editorLocale.value,
      uploadImages: canUploadImages.value ? uploadImages : undefined,
    },
  })
  editor.$on('change', ({ detail }) => {
    markdown.value = detail.value
  })
})

watch([markdown, editorLocale, canUploadImages], () => {
  editor?.$set({
    value: markdown.value,
    locale: editorLocale.value,
    uploadImages: canUploadImages.value ? uploadImages : undefined,
  })
})

onBeforeUnmount(() => {
  editor?.$destroy()
  editor = null
})

async function uploadImages(files: File[]) {
  if (files.some((file) => file.size > 2 * 1024 * 1024)) {
    toast.error(t('markdown_editor.upload_too_large'))
    return []
  }
  if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
    toast.error(t('markdown_editor.unsupported_type'))
    return []
  }

  const results = await Promise.allSettled(files.map((file) => uploadMediaImage(auth.token, file)))
  const images = results.flatMap((result) =>
    result.status === 'fulfilled' ? [{ ...result.value, alt: t('markdown_editor.image_alt') }] : []
  )
  if (images.length < files.length) toast.error(t('markdown_editor.upload_failed'))
  return images
}
</script>

<template>
  <PageShell
    :title="t('markdown_editor.title')"
    :description="t('markdown_editor.description')"
    class="markdown-editor-demo gap-4"
  >
    <p class="text-sm text-muted-foreground">
      {{
        canUploadImages
          ? t('markdown_editor.upload_help')
          : t('markdown_editor.upload_permission_required')
      }}
    </p>
    <div
      ref="editorRoot"
      class="markdown-editor-root min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-background"
    ></div>
  </PageShell>
</template>

<style scoped>
.markdown-editor-demo :deep(.bytemd) {
  height: 100%;
  color: var(--foreground);
  border: 0;
  background: var(--background);
}

.markdown-editor-demo :deep(.bytemd-fullscreen) {
  z-index: 50;
}

.markdown-editor-demo :deep(.bytemd-toolbar) {
  border-bottom-color: var(--border);
  background: var(--muted);
}

.markdown-editor-demo :deep(.bytemd-toolbar-icon:hover),
.markdown-editor-demo :deep(.bytemd-dropdown-item:hover),
.markdown-editor-demo :deep(.bytemd-toc-active) {
  background: var(--accent);
}

.markdown-editor-demo :deep(.bytemd-toolbar-tab-active),
.markdown-editor-demo :deep(.bytemd-toolbar-icon-active),
.markdown-editor-demo :deep(.bytemd-sidebar-close:hover) {
  color: var(--primary);
}

.markdown-editor-demo :deep(.bytemd-editor .CodeMirror) {
  color: var(--foreground);
  background: var(--background);
  font-family: var(--font-mono);
}

.markdown-editor-demo :deep(.bytemd-editor .CodeMirror-gutters),
.markdown-editor-demo :deep(.bytemd-editor .CodeMirror-scrollbar-filler),
.markdown-editor-demo :deep(.bytemd-editor .CodeMirror-gutter-filler) {
  background: var(--muted);
  border-right-color: var(--border);
}

.markdown-editor-demo :deep(.bytemd-preview .markdown-body) {
  color: var(--foreground);
}

.markdown-editor-demo :deep(.bytemd-preview .markdown-body pre),
.markdown-editor-demo :deep(.bytemd-preview .markdown-body code) {
  background: var(--muted);
}

.markdown-editor-demo :deep(.bytemd-preview .markdown-body a) {
  color: var(--primary);
}

.markdown-editor-demo :deep(.bytemd-split .bytemd-preview),
.markdown-editor-demo :deep(.bytemd-sidebar),
.markdown-editor-demo :deep(.bytemd-toolbar),
.markdown-editor-demo :deep(.bytemd-status) {
  border-color: var(--border);
}
</style>
