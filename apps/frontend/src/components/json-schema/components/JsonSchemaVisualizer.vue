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
  <div class="relative overflow-hidden h-full flex flex-col">
    <div
      class="flex items-center justify-between bg-secondary/80 backdrop-blur-xs px-4 py-2 border-b shrink-0"
    >
      <div class="flex items-center gap-2">
        <FileJsonIcon class="size-[18px]" />
        <span class="font-medium text-sm">{{ t.visualizerSource }}</span>
      </div>
      <button
        type="button"
        @click="handleDownload"
        class="p-1.5 hover:bg-secondary rounded-md transition-colors"
        :title="t.visualizerDownloadTitle"
      >
        <DownloadIcon class="size-4" />
      </button>
    </div>
    <div class="grow flex min-h-0 relative">
      <textarea
        v-model="editorText"
        @input="handleEditorUpdate"
        class="w-full h-full resize-none font-mono text-sm p-4 bg-transparent text-foreground focus-visible:outline-none border-0"
        spellcheck="false"
      />
    </div>
  </div>
</template>
