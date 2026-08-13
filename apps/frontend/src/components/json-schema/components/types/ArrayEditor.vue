<script setup lang="ts">
import TypeDropdown from '@/components/json-schema/components/TypeDropdown.vue'
import TypeEditor from '@/components/json-schema/components/TypeEditor.vue'
import { useTranslation } from '@/components/json-schema/hooks/useTranslation.ts'
import { getArrayItemsSchema } from '@/components/json-schema/lib/schemaEditor.ts'
import type {
  JSONSchema,
  ObjectJSONSchema,
  SchemaType,
} from '@/components/json-schema/types/jsonSchema.ts'
import { isBooleanSchema, withObjectSchema } from '@/components/json-schema/types/jsonSchema.ts'
import type { ValidationTreeNode } from '@/components/json-schema/types/validation.ts'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

const props = withDefaults(
  defineProps<{
    schema: JSONSchema
    path: string[]
    readOnly?: boolean
    validationNode?: ValidationTreeNode
    depth?: number
  }>(),
  { readOnly: false, depth: 0 }
)
const emit = defineEmits<{ change: [schema: ObjectJSONSchema] }>()

const t = useTranslation()
const minItemsId = useId()
const maxItemsId = useId()
const uniqueItemsId = useId()
const inputClass = 'h-8 text-sm'

const minItems = ref<number | null>(withObjectSchema(props.schema, (s) => s.minItems ?? null, null))
const maxItems = ref<number | null>(withObjectSchema(props.schema, (s) => s.maxItems ?? null, null))
const uniqueItems = ref(withObjectSchema(props.schema, (s) => s.uniqueItems || false, false))

const itemsSchema = computed(() => getArrayItemsSchema(props.schema) || { type: 'string' as const })
const itemType = computed(() =>
  withObjectSchema(
    itemsSchema.value,
    (s) => (s.type || 'string') as SchemaType,
    'string' as SchemaType
  )
)

const buildValidationProps = (
  overrides: { minItems?: number; maxItems?: number; uniqueItems?: boolean } = {}
) => {
  const base = isBooleanSchema(props.schema) ? {} : JSON.parse(JSON.stringify(props.schema))
  const validationProps: ObjectJSONSchema = {
    type: 'array',
    ...base,
    minItems: overrides.minItems ?? minItems.value ?? undefined,
    maxItems: overrides.maxItems ?? maxItems.value ?? undefined,
    uniqueItems: (overrides.uniqueItems ?? uniqueItems.value) || undefined,
  }
  if (validationProps.items === undefined && itemsSchema.value) {
    ;(validationProps as Record<string, unknown>).items = itemsSchema.value
  }
  const filtered: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(validationProps)) {
    if (value !== undefined) filtered[key] = value
  }
  return filtered as ObjectJSONSchema
}

const handleMinItemsInput = (value: string | number) => {
  minItems.value = value !== '' ? Number(value) : null
  handleValidationChange()
}
const handleMaxItemsInput = (value: string | number) => {
  maxItems.value = value !== '' ? Number(value) : null
  handleValidationChange()
}
const handleUniqueItemsChange = (checked: boolean) => {
  uniqueItems.value = checked
  emit('change', buildValidationProps({ uniqueItems: checked }))
}
const handleValidationChange = () => {
  emit('change', buildValidationProps())
}
const handleItemSchemaChange = (updatedItemSchema: ObjectJSONSchema) => {
  const base = isBooleanSchema(props.schema) ? {} : JSON.parse(JSON.stringify(props.schema))
  emit('change', { type: 'array' as const, ...base, items: updatedItemSchema })
}
const handleItemTypeChange = (newType: SchemaType) => {
  const currentItems = itemsSchema.value
  const plain = isBooleanSchema(currentItems) ? {} : JSON.parse(JSON.stringify(currentItems))
  handleItemSchemaChange({ ...plain, type: newType } as ObjectJSONSchema)
}

const minMaxError = computed(
  () => props.validationNode?.validation.errors?.find((err) => err.path[0] === 'minmax')?.message
)
const minItemsError = computed(
  () => props.validationNode?.validation.errors?.find((err) => err.path[0] === 'minItems')?.message
)
const maxItemsError = computed(
  () => props.validationNode?.validation.errors?.find((err) => err.path[0] === 'maxItems')?.message
)
</script>

<template>
  <div class="space-y-6">
    <div v-if="!readOnly || !!maxItems || !!minItems" class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div v-if="!readOnly || minItems !== null" class="flex flex-col gap-2">
        <label
          :for="minItemsId"
          :class="[
            'text-sm font-medium',
            (!!minMaxError || !!minItemsError) &&
              `
            text-red-500
          `,
          ]"
          >{{ t.arrayMinimumLabel }}</label
        >
        <Input
          :id="minItemsId"
          type="number"
          :model-value="minItems ?? ''"
          @update:model-value="handleMinItemsInput"
          :placeholder="t.arrayMinimumPlaceholder"
          :min="0"
          :disabled="readOnly"
          :class="inputClass"
        />
      </div>
      <div v-if="!readOnly || maxItems !== null" class="flex flex-col gap-2">
        <label
          :for="maxItemsId"
          :class="[
            'text-sm font-medium',
            (!!minMaxError || !!maxItemsError) &&
              `
            text-red-500
          `,
          ]"
          >{{ t.arrayMaximumLabel }}</label
        >
        <Input
          :id="maxItemsId"
          type="number"
          :model-value="maxItems ?? ''"
          @update:model-value="handleMaxItemsInput"
          :placeholder="t.arrayMaximumPlaceholder"
          :min="0"
          :disabled="readOnly"
          :class="inputClass"
        />
      </div>
      <div
        v-if="!!minMaxError || !!minItemsError || !!maxItemsError"
        class="text-xs whitespace-pre-line text-red-500 italic md:col-span-2"
      >
        {{ [minMaxError, minItemsError ?? maxItemsError].filter(Boolean).join('\n') }}
      </div>
    </div>

    <div v-if="!readOnly || uniqueItems" class="flex items-center gap-2">
      <Checkbox
        :id="uniqueItemsId"
        :model-value="uniqueItems"
        :disabled="readOnly"
        @update:model-value="handleUniqueItemsChange($event === true)"
      />
      <label :for="uniqueItemsId" class="cursor-pointer text-sm">{{
        t.arrayForceUniqueItemsLabel
      }}</label>
    </div>

    <div
      class="space-y-2 pt-4"
      :class="{ 'border-t border-border': !readOnly || !!minItems || !!maxItems || !!uniqueItems }"
    >
      <div class="mb-4 flex items-center justify-between">
        <label class="text-sm font-medium">{{ t.arrayItemTypeLabel }}</label>
        <TypeDropdown
          :read-only="readOnly"
          :model-value="itemType"
          @update:model-value="handleItemTypeChange"
        />
      </div>
      <TypeEditor
        :read-only="readOnly"
        :schema="itemsSchema!"
        :path="path"
        :validation-node="validationNode"
        :depth="depth + 1"
        @change="handleItemSchemaChange"
      />
    </div>
  </div>
</template>
