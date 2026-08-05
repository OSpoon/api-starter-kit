<script setup lang="ts">
import { Maximize2Icon, Minimize2Icon } from '@lucide/vue'

import {
  createSchemaStore,
  provideSchemaStore,
} from '@/components/json-schema/hooks/useSchemaStore.ts'
import { useTranslation } from '@/components/json-schema/hooks/useTranslation.ts'
import { cn } from '@/components/json-schema/lib/utils.ts'
import type { JSONSchema } from '@/components/json-schema/types/jsonSchema.ts'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import JsonSchemaVisualizer from './JsonSchemaVisualizer.vue'
import SchemaVisualEditor from './SchemaVisualEditor.vue'

export interface JsonSchemaEditorProps {
  schema?: JSONSchema
  readOnly?: boolean
  showJsonEditor?: boolean
  showFullscreen?: boolean
  class?: string
}

const props = withDefaults(defineProps<JsonSchemaEditorProps>(), {
  schema: () => ({ type: 'object' }),
  readOnly: false,
  showJsonEditor: true,
  showFullscreen: true,
})

const emit = defineEmits<{ 'update:schema': [schema: JSONSchema] }>()

const t = useTranslation()

let skipNextWatch = false
let pendingEmit: ReturnType<typeof setTimeout> | null = null
let lastEmittedJson = JSON.stringify(props.schema)

const store = createSchemaStore(props.schema, (newSchema) => {
  const json = JSON.stringify(newSchema)
  if (json === lastEmittedJson) return
  lastEmittedJson = json
  if (pendingEmit !== null) clearTimeout(pendingEmit)
  skipNextWatch = true
  pendingEmit = setTimeout(() => {
    pendingEmit = null
    emit('update:schema', newSchema)
    setTimeout(() => {
      skipNextWatch = false
    }, 0)
  }, 0)
})

provideSchemaStore(store)

watch(
  () => props.schema,
  (newSchema) => {
    if (skipNextWatch) return
    const json = JSON.stringify(newSchema)
    if (json === lastEmittedJson) return
    lastEmittedJson = json
    store.replaceSchema(newSchema)
  }
)

const isFullscreen = ref(false)
const leftPanelWidth = ref(50)
const containerRef = ref<HTMLDivElement | null>(null)
const isDragging = ref(false)
const activeTab = ref('visual')

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
}

const handleMouseDown = (e: MouseEvent) => {
  e.preventDefault()
  isDragging.value = true
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value || !containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const newWidth = ((e.clientX - rect.left) / rect.width) * 100
  if (newWidth >= 20 && newWidth <= 80) leftPanelWidth.value = newWidth
}

const handleMouseUp = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
}
</script>

<template>
  <div
    :class="
      cn(
        'rounded-xl border border-border bg-card',
        isFullscreen ? 'fixed inset-0 z-50 m-2' : 'w-full',
        props.class
      )
    "
  >
    <!-- Visual-only mode -->
    <template v-if="!showJsonEditor">
      <div :class="cn('flex w-full flex-col', isFullscreen ? 'h-full' : `h-125`)">
        <div class="flex w-full shrink-0 items-center justify-between border-b px-4 py-3">
          <h3 class="font-medium">{{ t.schemaEditorTitle }}</h3>
          <Button
            variant="ghost"
            size="icon-sm"
            v-if="showFullscreen"
            type="button"
            @click="toggleFullscreen"
            class="p-1.5"
          >
            <Maximize2Icon v-if="!isFullscreen" class="size-4" />
            <Minimize2Icon v-else class="size-4" />
          </Button>
        </div>
        <div class="min-h-0 grow">
          <SchemaVisualEditor :read-only="readOnly" />
        </div>
      </div>
    </template>

    <!-- Full mode with JSON editor -->
    <template v-else>
      <div class="block w-full lg:hidden">
        <Tabs v-model="activeTab" class="w-full">
          <div class="flex w-full items-center justify-between border-b px-4 py-3">
            <TabsList>
              <TabsTrigger value="visual">{{ t.schemaEditorEditModeVisual }}</TabsTrigger>
              <TabsTrigger value="json">{{ t.schemaEditorEditModeJson }}</TabsTrigger>
            </TabsList>
            <Button
              variant="ghost"
              size="icon-sm"
              v-if="showFullscreen"
              type="button"
              @click="toggleFullscreen"
              class="p-1.5"
            >
              <Maximize2Icon v-if="!isFullscreen" class="size-4" />
              <Minimize2Icon v-else class="size-4" />
            </Button>
          </div>
          <TabsContent
            value="visual"
            :class="
              cn(
                `
              w-full
              focus:outline-hidden
            `,
                isFullscreen ? 'h-full' : `h-100`
              )
            "
          >
            <SchemaVisualEditor :read-only="readOnly" />
          </TabsContent>
          <TabsContent
            value="json"
            :class="
              cn(
                `
              w-full
              focus:outline-hidden
            `,
                isFullscreen ? 'h-full' : `h-100`
              )
            "
          >
            <JsonSchemaVisualizer />
          </TabsContent>
        </Tabs>
      </div>

      <div
        ref="containerRef"
        :class="
          cn(
            `
          hidden w-full
          lg:flex lg:flex-col
        `,
            isFullscreen ? 'h-full' : `h-125`
          )
        "
      >
        <div class="flex w-full shrink-0 items-center justify-between border-b px-4 py-3">
          <h3 class="font-medium">{{ t.schemaEditorTitle }}</h3>
          <Button
            variant="ghost"
            size="icon-sm"
            v-if="showFullscreen"
            type="button"
            @click="toggleFullscreen"
            class="p-1.5"
          >
            <Maximize2Icon v-if="!isFullscreen" class="size-4" />
            <Minimize2Icon v-else class="size-4" />
          </Button>
        </div>
        <div class="flex min-h-0 w-full grow flex-row">
          <div class="h-full min-h-0 overflow-auto" :style="{ width: `${leftPanelWidth}%` }">
            <SchemaVisualEditor :read-only="readOnly" />
          </div>
          <div
            class="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary"
            @mousedown="handleMouseDown"
          />
          <div class="h-full min-h-0" :style="{ width: `${100 - leftPanelWidth}%` }">
            <JsonSchemaVisualizer />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
