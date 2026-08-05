<script setup lang="ts">
import { PlusIcon, XIcon } from '@lucide/vue'

import { useTranslation } from '@/components/json-schema/hooks/useTranslation.ts'
import type { JSONSchema, ObjectJSONSchema } from '@/components/json-schema/types/jsonSchema.ts'
import { isBooleanSchema, withObjectSchema } from '@/components/json-schema/types/jsonSchema.ts'
import type { ValidationTreeNode } from '@/components/json-schema/types/validation.ts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'

type Property = 'enum' | 'minLength' | 'maxLength' | 'pattern' | 'format'

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
const enumValue = ref('')
const minLengthId = useId()
const maxLengthId = useId()
const patternId = useId()
const formatId = useId()

const minLength = computed(() => withObjectSchema(props.schema, (s) => s.minLength, undefined))
const maxLength = computed(() => withObjectSchema(props.schema, (s) => s.maxLength, undefined))
const pattern = computed(() => withObjectSchema(props.schema, (s) => s.pattern, undefined))
const format = computed(() => withObjectSchema(props.schema, (s) => s.format, undefined))
const enumValues = computed(() =>
  withObjectSchema(props.schema, (s) => (s.enum as string[]) || [], [])
)

const handleValidationChange = (property: Property, value: unknown) => {
  const baseSchema = isBooleanSchema(props.schema)
    ? { type: 'string' as const }
    : JSON.parse(JSON.stringify(props.schema))
  const { type: _, description: __, ...validationProps } = baseSchema
  emit('change', { ...validationProps, type: 'string', [property]: value } as ObjectJSONSchema)
}

const handleAddEnumValue = () => {
  if (!enumValue.value.trim()) return
  if (!enumValues.value.includes(enumValue.value)) {
    handleValidationChange('enum', [...enumValues.value, enumValue.value])
  }
  enumValue.value = ''
}

const handleRemoveEnumValue = (index: number) => {
  const newEnumValues = [...enumValues.value]
  newEnumValues.splice(index, 1)
  if (newEnumValues.length === 0) {
    const baseSchema = isBooleanSchema(props.schema)
      ? { type: 'string' as const }
      : JSON.parse(JSON.stringify(props.schema))
    if (!isBooleanSchema(baseSchema) && 'enum' in baseSchema) {
      const { enum: _, ...rest } = baseSchema
      emit('change', rest as ObjectJSONSchema)
    } else {
      emit('change', baseSchema as ObjectJSONSchema)
    }
  } else {
    handleValidationChange('enum', newEnumValues)
  }
}

const minMaxError = computed(
  () => props.validationNode?.validation.errors?.find((err) => err.path[0] === 'length')?.message
)
const minLengthError = computed(
  () => props.validationNode?.validation.errors?.find((err) => err.path[0] === 'minLength')?.message
)
const maxLengthError = computed(
  () => props.validationNode?.validation.errors?.find((err) => err.path[0] === 'maxLength')?.message
)
const patternError = computed(
  () => props.validationNode?.validation.errors?.find((err) => err.path[0] === 'pattern')?.message
)
const formatError = computed(
  () => props.validationNode?.validation.errors?.find((err) => err.path[0] === 'format')?.message
)

const formatOptions = [
  { label: t.stringFormatNone, value: 'none' },
  { label: t.stringFormatDateTime, value: 'date-time' },
  { label: t.stringFormatDate, value: 'date' },
  { label: t.stringFormatTime, value: 'time' },
  { label: t.stringFormatEmail, value: 'email' },
  { label: t.stringFormatUri, value: 'uri' },
  { label: t.stringFormatUuid, value: 'uuid' },
  { label: t.stringFormatHostname, value: 'hostname' },
  { label: t.stringFormatIpv4, value: 'ipv4' },
  { label: t.stringFormatIpv6, value: 'ipv6' },
]

const needsDetail = computed(
  () =>
    !props.readOnly ||
    minLength.value !== undefined ||
    maxLength.value !== undefined ||
    pattern.value !== undefined ||
    format.value !== undefined ||
    enumValues.value.length > 0
)
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
      <p v-if="readOnly && !needsDetail" class="text-sm text-muted-foreground italic">
        {{ t.stringNoConstraint }}
      </p>

      <div v-if="!readOnly || minLength !== undefined" class="flex flex-col gap-2">
        <label
          :for="minLengthId"
          :class="[
            'text-sm font-medium',
            (!!minMaxError || !!minLengthError) &&
              `
            text-red-500
          `,
          ]"
          >{{ t.stringMinimumLengthLabel }}</label
        >
        <Input
          :id="minLengthId"
          type="number"
          :value="minLength ?? ''"
          @input="
            handleValidationChange(
              'minLength',
              ($event.target as HTMLInputElement).value
                ? Number(($event.target as HTMLInputElement).value)
                : undefined
            )
          "
          :placeholder="t.stringMinimumLengthPlaceholder"
          :min="0"
          :disabled="readOnly"
          class="h-8 text-sm"
        />
      </div>

      <div v-if="!readOnly || maxLength !== undefined" class="flex flex-col gap-2">
        <label
          :for="maxLengthId"
          :class="[
            'text-sm font-medium',
            (!!minMaxError || !!maxLengthError) &&
              `
            text-red-500
          `,
          ]"
          >{{ t.stringMaximumLengthLabel }}</label
        >
        <Input
          :id="maxLengthId"
          type="number"
          :value="maxLength ?? ''"
          @input="
            handleValidationChange(
              'maxLength',
              ($event.target as HTMLInputElement).value
                ? Number(($event.target as HTMLInputElement).value)
                : undefined
            )
          "
          :placeholder="t.stringMaximumLengthPlaceholder"
          :min="0"
          :disabled="readOnly"
          class="h-8 text-sm"
        />
      </div>

      <div
        v-if="!!minMaxError || !!minLengthError || !!maxLengthError"
        class="text-xs whitespace-pre-line text-red-500 italic md:col-span-2"
      >
        {{ [minMaxError, minLengthError ?? maxLengthError].filter(Boolean).join('\n') }}
      </div>
    </div>

    <div v-if="!readOnly || (pattern && pattern !== '')" class="flex flex-col gap-2">
      <label
        :for="patternId"
        :class="[
          'text-sm font-medium',
          !!patternError &&
            `
        text-red-500
      `,
        ]"
        >{{ t.stringPatternLabel }}</label
      >
      <Input
        :id="patternId"
        type="text"
        :value="pattern ?? ''"
        @input="
          handleValidationChange('pattern', ($event.target as HTMLInputElement).value || undefined)
        "
        :placeholder="t.stringPatternPlaceholder"
        :disabled="readOnly"
        class="h-8 text-sm"
      />
    </div>

    <div v-if="!readOnly || (format && format !== 'none')" class="flex flex-col gap-2">
      <label
        :for="formatId"
        :class="[
          'text-sm font-medium',
          !!formatError &&
            `
        text-red-500
      `,
        ]"
        >{{ t.stringFormatLabel }}</label
      >
      <NativeSelect
        :id="formatId"
        :value="format || 'none'"
        size="sm"
        @change="
          handleValidationChange(
            'format',
            ($event.target as HTMLSelectElement).value === 'none'
              ? undefined
              : ($event.target as HTMLSelectElement).value
          )
        "
        :disabled="readOnly"
      >
        <option v-for="opt in formatOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </NativeSelect>
    </div>

    <div v-if="!readOnly || enumValues.length > 0" class="space-y-2 border-t border-border pt-2">
      <label class="text-sm font-medium">{{ t.stringAllowedValuesEnumLabel }}</label>
      <div class="mb-4 flex flex-wrap gap-2">
        <template v-if="enumValues.length > 0">
          <span
            v-for="(value, index) in enumValues"
            :key="value"
            class="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium"
          >
            {{ value }}
            <Button
              variant="ghost"
              size="icon-sm"
              v-if="!readOnly"
              type="button"
              @click="handleRemoveEnumValue(index)"
              class="hover:text-destructive"
            >
              <XIcon class="size-3" />
            </Button>
          </span>
        </template>
        <p v-else class="text-xs text-muted-foreground italic">
          {{ t.stringAllowedValuesEnumNone }}
        </p>
      </div>
      <div v-if="!readOnly" class="flex items-center gap-2">
        <Input
          type="text"
          v-model="enumValue"
          :placeholder="t.stringAllowedValuesEnumAddPlaceholder"
          class="flex-1 text-sm"
          @keydown.enter="handleAddEnumValue()"
        />
        <Button variant="outline" size="sm" type="button" @click="handleAddEnumValue()">
          <PlusIcon class="size-3" /> {{ t.stringAllowedValuesEnumAddLabel }}
        </Button>
      </div>
    </div>
  </div>
</template>
