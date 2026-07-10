<script setup lang="ts">
import { DownloadIcon, FileJsonIcon } from '@lucide/vue'

import { useSchemaStore } from '@/components/json-schema/hooks/useSchemaStore.ts'
import { useTranslation } from '@/components/json-schema/hooks/useTranslation.ts'

defineProps<{ class?: string }>()

const store = useSchemaStore()
const schema = computed(() => store.schema.value)
const t = useTranslation()

let lastStoreJson = JSON.stringify(schema.value)
const editorText = ref(JSON.stringify(schema.value, null, 2))

watch(
  schema,
  (newSchema) => {
    const newJson = JSON.stringify(newSchema)
    if (newJson === lastStoreJson) return
    lastStoreJson = newJson
    editorText.value = JSON.stringify(newSchema, null, 2)
  },
  { deep: true }
)

const handleEditorUpdate = () => {
  try {
    const parsed = JSON.parse(editorText.value)
    const newJson = JSON.stringify(parsed)
    if (newJson === lastStoreJson) return
    lastStoreJson = newJson
    store.replaceSchema(parsed)
  } catch {}
}

const handleDownload = () => {
  const content = JSON.stringify(schema.value, null, 2)
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = t.visualizerDownloadFileName ?? 'schema.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="relative flex h-full flex-col overflow-hidden">
    <div
      class="
        flex shrink-0 items-center justify-between border-b bg-secondary/80 px-4
        py-2 backdrop-blur-xs
      "
    >
      <div class="flex items-center gap-2">
        <FileJsonIcon class="size-4.5" />
        <span class="text-sm font-medium">{{ t.visualizerSource }}</span>
      </div>
      <button
        type="button"
        @click="handleDownload"
        class="
          rounded-md p-1.5 transition-colors
          hover:bg-secondary
        "
        :title="t.visualizerDownloadTitle"
      >
        <DownloadIcon class="size-4" />
      </button>
    </div>
    <div class="relative flex min-h-0 grow">
      <textarea
        v-model="editorText"
        @input="handleEditorUpdate"
        class="
          size-full resize-none border-0 bg-transparent p-4 font-mono text-sm
          text-foreground
          focus-visible:outline-none
        "
        spellcheck="false"
      />
    </div>
  </div>
</template>
