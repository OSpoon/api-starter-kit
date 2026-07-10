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
        'mb-2 rounded-lg border border-border transition-colors duration-200',
        depth > 0 && `
          ml-0
          sm:ml-4
        `
      )
    "
  >
    <div
      class="
        group relative flex items-center justify-between gap-2 rounded-md px-3
        py-2 transition-colors
        hover:bg-secondary/30
      "
    >
      <div class="flex min-w-0 grow items-center gap-2">
        <button
          type="button"
          class="
            text-muted-foreground transition-colors
            hover:text-foreground
          "
          @click="expanded = !expanded"
          :aria-label="expanded ? t.collapse : t.expand"
        >
          <ChevronDownIcon v-if="expanded" class="size-4.5" />
          <ChevronRightIcon v-else class="size-4.5" />
        </button>

        <div class="flex min-w-0 grow items-center gap-2 overflow-visible">
          <div class="flex min-w-0 grow items-center gap-2 overflow-visible">
            <input
              v-if="!readOnly && isEditingName"
              v-model="tempName"
              @blur="handleNameSubmit()"
              @keydown.enter="handleNameSubmit()"
              :class="[inputClass, `
                z-10 h-8 max-w-full min-w-30 text-sm font-medium
              `]"
              ref="nameInput"
              @focus="($event.target as HTMLInputElement)?.select()"
            />
            <button
              v-else
              type="button"
              @click="startEditingName()"
              @keydown.enter="startEditingName()"
              class="
                -mx-0.5 max-w-[50%] min-w-20 cursor-text truncate rounded-sm
                px-2 py-0.5 text-left text-sm font-medium text-foreground
                transition-all
                hover:bg-secondary/30 hover:shadow-xs hover:ring-1
                hover:ring-ring/20
              "
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
                `
                  z-10 h-8 min-w-37.5 flex-1 text-xs text-muted-foreground
                  italic
                `,
              ]"
              @focus="($event.target as HTMLInputElement)?.select()"
            />
            <button
              v-else-if="displayDesc"
              type="button"
              @click="startEditingDesc()"
              class="
                -mx-0.5 mr-2 max-w-[40%] flex-1 cursor-text truncate rounded-sm
                px-2 py-0.5 text-left text-xs text-muted-foreground italic
                transition-all
                hover:bg-secondary/30 hover:shadow-xs hover:ring-1
                hover:ring-ring/20
              "
            >
              {{ displayDesc }}
            </button>
            <button
              v-else
              type="button"
              @click="startEditingDesc()"
              class="
                -mx-0.5 mr-2 max-w-[40%] flex-1 cursor-text truncate rounded-sm
                px-2 py-0.5 text-left text-xs text-muted-foreground/50 italic
                opacity-0 transition-all
                group-hover:opacity-100
                hover:bg-secondary/30 hover:shadow-xs hover:ring-1
                hover:ring-ring/20
              "
            >
              {{ t.propertyDescriptionButton }}
            </button>
          </div>

          <div class="flex shrink-0 items-center justify-end gap-2">
            <TypeDropdown
              :model-value="type()"
              :read-only="readOnly"
              @update:model-value="handleTypeChange"
            />
            <button
              type="button"
              @click="handleRequiredToggle"
              :class="[
                `
                  inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs
                  font-medium transition-colors
                `,
                required ? 'bg-red-500/10 text-red-500' : `
                  bg-secondary text-muted-foreground
                `,
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

      <div v-if="!readOnly" class="
        flex items-center gap-1 text-muted-foreground
      ">
        <button
          type="button"
          @click="handleDelete"
          class="
            rounded-md p-1 opacity-0 transition-colors
            group-hover:opacity-100
            hover:bg-secondary hover:text-destructive
          "
          :aria-label="t.propertyDelete"
        >
          <XIcon class="size-4" />
        </button>
      </div>
    </div>

    <div v-if="expanded" class="
      px-2 pt-1 pb-2
      sm:px-3
    ">
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
