<script setup lang="ts">
import { useTranslation } from '@/components/json-schema/hooks/useTranslation.ts'
import type { JSONSchema, ObjectJSONSchema } from '@/components/json-schema/types/jsonSchema.ts'
import { withObjectSchema } from '@/components/json-schema/types/jsonSchema.ts'
import type { ValidationTreeNode } from '@/components/json-schema/types/validation.ts'

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

const enumValues = () =>
  withObjectSchema(props.schema, (s) => s.enum as boolean[] | undefined, null)
const hasRestrictions = () => Array.isArray(enumValues())
const allowsTrue = () => !hasRestrictions() || enumValues()?.includes(true) || false
const allowsFalse = () => !hasRestrictions() || enumValues()?.includes(false) || false

const handleAllowedChange = (value: boolean, allowed: boolean) => {
  let newEnum: boolean[] | undefined
  if (allowed) {
    if (!hasRestrictions()) return
    if (enumValues()?.includes(value)) return
    newEnum = enumValues() ? [...(enumValues() as boolean[]), value] : [value]
    if (newEnum.includes(true) && newEnum.includes(false)) {
      newEnum = undefined
    }
  } else {
    if (hasRestrictions() && !enumValues()?.includes(value)) return
    newEnum = [!value]
  }
  if (newEnum) {
    emit('change', { type: 'boolean', enum: newEnum })
  } else {
    emit('change', { type: 'boolean' })
  }
}

const hasEnum = () => {
  const ev = enumValues()
  return ev && ev.length > 0
}
</script>

<template>
  <div class="space-y-4">
    <p v-if="readOnly && !hasEnum()" class="text-sm text-muted-foreground italic">
      {{ t.booleanNoConstraint }}
    </p>
    <div v-if="!readOnly || !allowsTrue() || !allowsFalse()" class="space-y-2 pt-2">
      <template v-if="!readOnly || hasEnum()">
        <label class="text-sm font-medium">{{ t.booleanAllowedValuesLabel }}</label>
        <div class="space-y-3">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              :checked="allowsTrue()"
              :disabled="readOnly"
              @change="handleAllowedChange(true, ($event.target as HTMLInputElement).checked)"
              class="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span class="text-sm">{{ t.booleanAllowTrueLabel }}</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              :checked="allowsFalse()"
              :disabled="readOnly"
              @change="handleAllowedChange(false, ($event.target as HTMLInputElement).checked)"
              class="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span class="text-sm">{{ t.booleanAllowFalseLabel }}</span>
          </label>
        </div>
      </template>
      <p v-if="!allowsTrue() && !allowsFalse()" class="text-xs text-amber-600 mt-2">
        {{ t.booleanNeitherWarning }}
      </p>
    </div>
  </div>
</template>
