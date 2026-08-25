<script setup lang="ts">
import { ChevronDownIcon, ChevronRightIcon, XIcon } from '@lucide/vue'

import { useSchemaStore } from '@/components/json-schema/hooks/useSchemaStore.ts'
import { useTranslation } from '@/components/json-schema/hooks/useTranslation.ts'
import { cn } from '@/components/json-schema/lib/utils.ts'
import type {
  JSONSchema,
  ObjectJSONSchema,
  SchemaType,
} from '@/components/json-schema/types/jsonSchema.ts'
import {
  getSchemaDescription,
  withObjectSchema,
} from '@/components/json-schema/types/jsonSchema.ts'
import type { ValidationTreeNode } from '@/components/json-schema/types/validation.ts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import TypeDropdown from './TypeDropdown.vue'
import TypeEditor from './TypeEditor.vue'

const props = withDefaults(
  defineProps<{
    path: string[]
    name: string
    schema: JSONSchema
    required?: boolean
    readOnly?: boolean
    validationNode?: ValidationTreeNode
    depth?: number
  }>(),
  { required: false, readOnly: false, depth: 0 }
)

const store = useSchemaStore()
const t = useTranslation()
const expanded = ref(false)

const displayName = computed(() => props.name)
const displayDesc = computed(() => getSchemaDescription(props.schema))
const displayTitle = computed(() => withObjectSchema(props.schema, (s) => s.title || '', ''))
const tempName = ref(props.name)
const tempDesc = ref(displayDesc.value)
const tempTitle = ref(displayTitle.value)
const descriptionId = useId()
const titleId = useId()

const type = () =>
  withObjectSchema(props.schema, (s) => (s.type || 'object') as SchemaType, 'object' as SchemaType)

const handleNameSubmit = () => {
  const trimmedName = tempName.value.trim()
  if (trimmedName && trimmedName !== props.name) {
    store.renameProperty(props.path, props.name, trimmedName)
  } else {
    tempName.value = props.name
  }
}

watch(
  () => props.name,
  (newName) => {
    tempName.value = newName
  }
)

const handleDescSubmit = () => {
  const trimmedDesc = tempDesc.value.trim()
  if (trimmedDesc !== getSchemaDescription(props.schema)) {
    const currentSchema = store.getAtPath([...props.path, props.name])
    const plain = JSON.parse(JSON.stringify(currentSchema ?? { type: 'object' }))
    plain.description = trimmedDesc || undefined
    store.updateProperty(props.path, props.name, plain)
  } else {
    tempDesc.value = getSchemaDescription(props.schema)
  }
}

const handleTitleSubmit = () => {
  const trimmedTitle = tempTitle.value.trim()
  if (trimmedTitle !== displayTitle.value) {
    const currentSchema = store.getAtPath([...props.path, props.name])
    const plain = JSON.parse(JSON.stringify(currentSchema ?? { type: 'object' }))
    if (trimmedTitle) plain.title = trimmedTitle
    else delete plain.title
    store.updateProperty(props.path, props.name, plain)
  } else {
    tempTitle.value = displayTitle.value
  }
}

watch(displayDesc, (newDescription) => {
  tempDesc.value = newDescription
})

watch(displayTitle, (newTitle) => {
  tempTitle.value = newTitle
})

const handleSchemaUpdate = (updatedSchema: ObjectJSONSchema) => {
  const description = getSchemaDescription(props.schema)
  const plain = JSON.parse(JSON.stringify(updatedSchema))
  plain.description = description || undefined
  store.updateProperty(props.path, props.name, plain)
}

const handleTypeChange = (newType: SchemaType) => {
  const currentSchema = store.getAtPath([...props.path, props.name])
  const plain = JSON.parse(JSON.stringify(currentSchema ?? { type: 'object' }))
  plain.type = newType
  store.updateProperty(props.path, props.name, plain)
}

const handleRequiredToggle = () => {
  if (props.readOnly) return
  store.setPropertyRequired(props.path, props.name, !props.required)
}
const handleDelete = () => {
  store.deleteProperty(props.path, props.name)
}

const inputClass = 'h-8 text-sm'
</script>

<template>
  <div
    :class="
      cn(
        'mb-2 rounded-lg border border-border transition-colors duration-200',
        depth > 0 &&
          `
          ml-0
          sm:ml-4
        `
      )
    "
  >
    <div
      class="group relative flex items-center justify-between gap-2 rounded-md px-3 py-2 transition-colors hover:bg-secondary/30"
    >
      <div class="flex min-w-0 grow items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          class="text-muted-foreground transition-colors hover:text-foreground"
          @click="expanded = !expanded"
          :aria-label="expanded ? t.collapse : t.expand"
        >
          <ChevronDownIcon v-if="expanded" class="size-4.5" />
          <ChevronRightIcon v-else class="size-4.5" />
        </Button>

        <div class="flex min-w-0 grow items-center gap-2 overflow-visible">
          <div class="flex min-w-0 grow items-center gap-2 overflow-visible">
            <Input
              v-if="!readOnly"
              v-model="tempName"
              @blur="handleNameSubmit()"
              @keydown.enter.prevent="handleNameSubmit()"
              :aria-label="t.fieldNameLabel"
              :class="[inputClass, 'z-10 max-w-[75%] min-w-30 flex-[1_1_0%] text-sm font-medium']"
            />
            <span
              v-else
              class="-mx-0.5 max-w-[75%] min-w-20 flex-[1_1_0%] truncate px-2 py-0.5 text-left text-foreground"
            >
              {{ displayName }}
            </span>

          </div>

          <div class="flex shrink-0 items-center justify-end gap-2">
            <TypeDropdown
              :model-value="type()"
              :read-only="readOnly"
              @update:model-value="handleTypeChange"
            />
            <Button
              variant="secondary"
              size="sm"
              type="button"
              @click="handleRequiredToggle"
              :class="['px-2 py-1 text-xs', required ? 'bg-red-500/10 text-red-500' : '']"
            >
              {{ required ? t.propertyRequired : t.propertyOptional }}
            </Button>
          </div>
        </div>
      </div>

      <Badge
        v-if="(validationNode?.cumulativeChildrenErrors ?? 0) > 0"
        variant="destructive"
        class="h-5 min-w-5 rounded-full px-1 font-mono tabular-nums"
      >
        {{ validationNode!.cumulativeChildrenErrors }}
      </Badge>

      <div v-if="!readOnly" class="flex items-center gap-1 text-muted-foreground">
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          @click="handleDelete"
          class="p-1 hover:text-destructive"
          :aria-label="t.propertyDelete"
        >
          <XIcon class="size-4" />
        </Button>
      </div>
    </div>

    <div v-if="expanded" class="px-2 pt-1 pb-2 sm:px-3">
      <div class="mb-3 grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
        <div v-if="!readOnly || displayTitle" class="sm:col-span-1">
          <label :for="titleId" class="mb-2 block text-sm font-medium">
            {{ t.fieldTitle }}
          </label>
          <Input
            v-if="!readOnly"
            :id="titleId"
            v-model="tempTitle"
            @blur="handleTitleSubmit()"
            @keydown.enter.prevent="handleTitleSubmit()"
            :placeholder="t.propertyTitlePlaceholder"
            :aria-label="t.propertyTitlePlaceholder"
            :class="[inputClass, 'text-xs']"
          />
          <p v-else-if="displayTitle" class="text-sm text-muted-foreground">{{ displayTitle }}</p>
        </div>
        <div v-if="!readOnly || displayDesc" class="sm:col-span-2">
          <label :for="descriptionId" class="mb-2 block text-sm font-medium">
            {{ t.fieldDescription }}
          </label>
          <Input
            v-if="!readOnly"
            :id="descriptionId"
            v-model="tempDesc"
            @blur="handleDescSubmit()"
            @keydown.enter.prevent="handleDescSubmit()"
            :placeholder="t.propertyDescriptionPlaceholder"
            :aria-label="t.propertyDescriptionPlaceholder"
            :class="[inputClass, 'text-xs text-muted-foreground italic']"
          />
          <p v-else-if="displayDesc" class="text-sm text-muted-foreground">{{ displayDesc }}</p>
        </div>
      </div>
      <TypeEditor
        :schema="schema"
        :path="[...path, name]"
        :read-only="readOnly"
        :validation-node="validationNode"
        :depth="depth + 1"
        @change="handleSchemaUpdate"
      />
    </div>
  </div>
</template>
