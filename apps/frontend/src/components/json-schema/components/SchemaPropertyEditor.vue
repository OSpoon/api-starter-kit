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
const isEditingName = ref(false)
const isEditingDesc = ref(false)

const displayName = computed(() => props.name)
const displayDesc = computed(() => getSchemaDescription(props.schema))
const tempName = ref('')
const tempDesc = ref('')

const type = () =>
  withObjectSchema(props.schema, (s) => (s.type || 'object') as SchemaType, 'object' as SchemaType)

const startEditingName = () => {
  tempName.value = props.name
  isEditingName.value = true
}
const startEditingDesc = () => {
  tempDesc.value = getSchemaDescription(props.schema)
  isEditingDesc.value = true
}

const handleNameSubmit = () => {
  const trimmedName = tempName.value.trim()
  if (trimmedName && trimmedName !== props.name) {
    store.renameProperty(props.path, props.name, trimmedName)
  } else {
    tempName.value = props.name
  }
  isEditingName.value = false
}

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
  isEditingDesc.value = false
}

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

const inputClass =
  'flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 outline-none disabled:cursor-not-allowed disabled:opacity-50'
</script>

<template>
  <div
    :class="
      cn(
        'mb-2 rounded-lg transition-colors duration-200 border border-border',
        depth > 0 && 'ml-0 sm:ml-4'
      )
    "
  >
    <div
      class="relative flex items-center gap-2 py-2 px-3 rounded-md transition-colors hover:bg-secondary/30 justify-between group"
    >
      <div class="flex items-center gap-2 grow min-w-0">
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground transition-colors"
          @click="expanded = !expanded"
          :aria-label="expanded ? t.collapse : t.expand"
        >
          <ChevronDownIcon v-if="expanded" class="size-[18px]" />
          <ChevronRightIcon v-else class="size-[18px]" />
        </button>

        <div class="flex items-center gap-2 grow min-w-0 overflow-visible">
          <div class="flex items-center gap-2 min-w-0 grow overflow-visible">
            <input
              v-if="!readOnly && isEditingName"
              v-model="tempName"
              @blur="handleNameSubmit()"
              @keydown.enter="handleNameSubmit()"
              :class="[inputClass, 'h-8 text-sm font-medium min-w-[120px] max-w-full z-10']"
              ref="nameInput"
              @focus="($event.target as HTMLInputElement)?.select()"
            />
            <button
              v-else
              type="button"
              @click="startEditingName()"
              @keydown.enter="startEditingName()"
              class="text-sm font-medium cursor-text px-2 py-0.5 -mx-0.5 rounded-sm hover:bg-secondary/30 hover:shadow-xs hover:ring-1 hover:ring-ring/20 transition-all text-left truncate min-w-[80px] max-w-[50%] text-foreground"
            >
              {{ displayName }}
            </button>

            <input
              v-if="!readOnly && isEditingDesc"
              v-model="tempDesc"
              @blur="handleDescSubmit()"
              @keydown.enter="handleDescSubmit()"
              :placeholder="t.propertyDescriptionPlaceholder"
              :class="[
                inputClass,
                'h-8 text-xs text-muted-foreground italic flex-1 min-w-[150px] z-10',
              ]"
              @focus="($event.target as HTMLInputElement)?.select()"
            />
            <button
              v-else-if="displayDesc"
              type="button"
              @click="startEditingDesc()"
              class="text-xs text-muted-foreground italic cursor-text px-2 py-0.5 -mx-0.5 rounded-sm hover:bg-secondary/30 hover:shadow-xs hover:ring-1 hover:ring-ring/20 transition-all text-left truncate flex-1 max-w-[40%] mr-2"
            >
              {{ displayDesc }}
            </button>
            <button
              v-else
              type="button"
              @click="startEditingDesc()"
              class="text-xs text-muted-foreground/50 italic cursor-text px-2 py-0.5 -mx-0.5 rounded-sm hover:bg-secondary/30 hover:shadow-xs hover:ring-1 hover:ring-ring/20 transition-all opacity-0 group-hover:opacity-100 text-left truncate flex-1 max-w-[40%] mr-2"
            >
              {{ t.propertyDescriptionButton }}
            </button>
          </div>

          <div class="flex items-center gap-2 justify-end shrink-0">
            <TypeDropdown
              :model-value="type()"
              :read-only="readOnly"
              @update:model-value="handleTypeChange"
            />
            <button
              type="button"
              @click="handleRequiredToggle"
              :class="[
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors',
                required ? 'bg-red-500/10 text-red-500' : 'bg-secondary text-muted-foreground',
              ]"
            >
              {{ required ? t.propertyRequired : t.propertyOptional }}
            </button>
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
        <button
          type="button"
          @click="handleDelete"
          class="p-1 rounded-md hover:bg-secondary hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
          :aria-label="t.propertyDelete"
        >
          <XIcon class="size-4" />
        </button>
      </div>
    </div>

    <div v-if="expanded" class="pt-1 pb-2 px-2 sm:px-3">
      <p v-if="readOnly && displayDesc" class="pb-2 text-sm">{{ displayDesc }}</p>
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
