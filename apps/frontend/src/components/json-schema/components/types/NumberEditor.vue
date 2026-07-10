<script setup lang="ts">
import { PlusIcon, XIcon } from '@lucide/vue'

import { useTranslation } from '@/components/json-schema/hooks/useTranslation.ts'
import type { JSONSchema, ObjectJSONSchema } from '@/components/json-schema/types/jsonSchema.ts'
import { isBooleanSchema, withObjectSchema } from '@/components/json-schema/types/jsonSchema.ts'
import type { ValidationTreeNode } from '@/components/json-schema/types/validation.ts'

type Property =
  | 'minimum'
  | 'maximum'
  | 'exclusiveMinimum'
  | 'exclusiveMaximum'
  | 'multipleOf'
  | 'enum'

const props = withDefaults(
  defineProps<{
    schema: JSONSchema
    path: string[]
    readOnly?: boolean
    validationNode?: ValidationTreeNode
    depth?: number
    integer?: boolean
  }>(),
  { readOnly: false, depth: 0, integer: false }
)
const emit = defineEmits<{ change: [schema: ObjectJSONSchema] }>()

const enumValue = ref('')
const t = useTranslation()
const maximumId = useId()
const minimumId = useId()
const exclusiveMinimumId = useId()
const exclusiveMaximumId = useId()
const multipleOfId = useId()

const minimum = computed(() => withObjectSchema(props.schema, (s) => s.minimum, undefined))
const maximum = computed(() => withObjectSchema(props.schema, (s) => s.maximum, undefined))
const exclusiveMinimum = computed(() =>
  withObjectSchema(props.schema, (s) => s.exclusiveMinimum, undefined)
)
const exclusiveMaximum = computed(() =>
  withObjectSchema(props.schema, (s) => s.exclusiveMaximum, undefined)
)
const multipleOf = computed(() => withObjectSchema(props.schema, (s) => s.multipleOf, undefined))
const enumValues = computed(() =>
  withObjectSchema(props.schema, (s) => (s.enum as number[]) || [], [])
)

const handleValidationChange = (property: Property, value: unknown) => {
  const baseProperties: Partial<ObjectJSONSchema> = { type: props.integer ? 'integer' : 'number' }
  if (!isBooleanSchema(props.schema)) {
    if (props.schema.minimum !== undefined) baseProperties.minimum = props.schema.minimum
    if (props.schema.maximum !== undefined) baseProperties.maximum = props.schema.maximum
    if (props.schema.exclusiveMinimum !== undefined)
      baseProperties.exclusiveMinimum = props.schema.exclusiveMinimum
    if (props.schema.exclusiveMaximum !== undefined)
      baseProperties.exclusiveMaximum = props.schema.exclusiveMaximum
    if (props.schema.multipleOf !== undefined) baseProperties.multipleOf = props.schema.multipleOf
    if (props.schema.enum !== undefined) baseProperties.enum = [...(props.schema.enum as unknown[])]
  }
  if (value !== undefined) {
    const updated = { ...baseProperties, [property]: value }
    emit('change', updated as ObjectJSONSchema)
    return
  }
  const result = { ...baseProperties }
  delete (result as Record<string, unknown>)[property]
  emit('change', result as ObjectJSONSchema)
}

const handleAddEnumValue = () => {
  if (!enumValue.value.trim()) return
  const numValue = Number(enumValue.value)
  if (Number.isNaN(numValue)) return
  const validValue = props.integer ? Math.floor(numValue) : numValue
  if (!enumValues.value.includes(validValue)) {
    handleValidationChange('enum', [...enumValues.value, validValue])
  }
  enumValue.value = ''
}

const handleRemoveEnumValue = (index: number) => {
  const newEnumValues = [...enumValues.value]
  newEnumValues.splice(index, 1)
  handleValidationChange('enum', newEnumValues.length === 0 ? undefined : newEnumValues)
}

const minMaxError = computed(
  () => props.validationNode?.validation.errors?.find((err) => err.path[0] === 'minMax')?.message
)
const redundantMinError = computed(
  () =>
    props.validationNode?.validation.errors?.find((err) => err.path[0] === 'redundantMinimum')
      ?.message
)
const redundantMaxError = computed(
  () =>
    props.validationNode?.validation.errors?.find((err) => err.path[0] === 'redundantMaximum')
      ?.message
)
const enumError = computed(
  () => props.validationNode?.validation.errors?.find((err) => err.path[0] === 'enum')?.message
)
const multipleOfError = computed(
  () =>
    props.validationNode?.validation.errors?.find((err) => err.path[0] === 'multipleOf')?.message
)

const hasConstraint = computed(
  () =>
    !!minimum.value ||
    !!maximum.value ||
    !!exclusiveMinimum.value ||
    !!exclusiveMaximum.value ||
    !!multipleOf.value ||
    enumValues.value.length > 0
)
const numInputClass =
  'flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 outline-none disabled:cursor-not-allowed disabled:opacity-50'
</script>

<template>
  <div class="space-y-4">
    <p v-if="readOnly && !hasConstraint" class="
      text-sm text-muted-foreground italic
    ">
      {{ t.numberNoConstraint }}
    </p>

    <div v-if="!readOnly || hasConstraint" class="
      grid grid-cols-1 gap-4
      md:grid-cols-2
    ">
      <div class="
        space-y-0
        md:col-span-2
      ">
        <div v-if="!!minMaxError" class="text-xs text-red-500 italic">{{ minMaxError }}</div>
        <div v-if="!!redundantMinError" class="text-xs text-red-500 italic">
          {{ redundantMinError }}
        </div>
        <div v-if="!!redundantMaxError" class="text-xs text-red-500 italic">
          {{ redundantMaxError }}
        </div>
        <div v-if="!!enumError" class="text-xs text-red-500 italic">{{ enumError }}</div>
      </div>

      <div v-if="!readOnly || minimum !== undefined" class="flex flex-col gap-2">
        <label
          :for="minimumId"
          :class="[
            'text-sm font-medium',
            minimum !== undefined && (!!minMaxError || !!redundantMinError) && `
              text-red-500
            `,
          ]"
          >{{ t.numberMinimumLabel }}</label
        >
        <input
          :id="minimumId"
          type="number"
          :value="minimum ?? ''"
          @input="
            handleValidationChange(
              'minimum',
              ($event.target as HTMLInputElement).value
                ? Number(($event.target as HTMLInputElement).value)
                : undefined
            )
          "
          :step="integer ? 1 : undefined"
          :placeholder="t.numberMinimumPlaceholder"
          :disabled="readOnly"
          :class="numInputClass"
        />
      </div>

      <div v-if="!readOnly || maximum !== undefined" class="flex flex-col gap-2">
        <label
          :for="maximumId"
          :class="[
            'text-sm font-medium',
            maximum !== undefined && (!!minMaxError || !!redundantMaxError) && `
              text-red-500
            `,
          ]"
          >{{ t.numberMaximumLabel }}</label
        >
        <input
          :id="maximumId"
          type="number"
          :value="maximum ?? ''"
          @input="
            handleValidationChange(
              'maximum',
              ($event.target as HTMLInputElement).value
                ? Number(($event.target as HTMLInputElement).value)
                : undefined
            )
          "
          :step="integer ? 1 : undefined"
          :placeholder="t.numberMaximumPlaceholder"
          :disabled="readOnly"
          :class="numInputClass"
        />
      </div>
    </div>

    <div
      v-if="!readOnly || !!exclusiveMaximum || !!exclusiveMinimum"
      class="
        grid grid-cols-1 gap-4
        md:grid-cols-2
      "
    >
      <div v-if="!readOnly || !!exclusiveMinimum" class="flex flex-col gap-2">
        <label :for="exclusiveMinimumId" class="text-sm font-medium">{{
          t.numberExclusiveMinimumLabel
        }}</label>
        <input
          :id="exclusiveMinimumId"
          type="number"
          :value="exclusiveMinimum ?? ''"
          @input="
            handleValidationChange(
              'exclusiveMinimum',
              ($event.target as HTMLInputElement).value
                ? Number(($event.target as HTMLInputElement).value)
                : undefined
            )
          "
          :step="integer ? 1 : undefined"
          :placeholder="t.numberExclusiveMinimumPlaceholder"
          :disabled="readOnly"
          :class="numInputClass"
        />
      </div>
      <div v-if="!readOnly || !!exclusiveMaximum" class="flex flex-col gap-2">
        <label :for="exclusiveMaximumId" class="text-sm font-medium">{{
          t.numberExclusiveMaximumLabel
        }}</label>
        <input
          :id="exclusiveMaximumId"
          type="number"
          :value="exclusiveMaximum ?? ''"
          @input="
            handleValidationChange(
              'exclusiveMaximum',
              ($event.target as HTMLInputElement).value
                ? Number(($event.target as HTMLInputElement).value)
                : undefined
            )
          "
          :step="integer ? 1 : undefined"
          :placeholder="t.numberExclusiveMaximumPlaceholder"
          :disabled="readOnly"
          :class="numInputClass"
        />
      </div>
    </div>

    <div v-if="!readOnly || !!multipleOf" class="flex flex-col gap-2">
      <label
        :for="multipleOfId"
        :class="['text-sm font-medium', !!multipleOfError && 'text-red-500']"
        >{{ t.numberMultipleOfLabel }}</label
      >
      <input
        :id="multipleOfId"
        type="number"
        :value="multipleOf ?? ''"
        @input="
          handleValidationChange(
            'multipleOf',
            ($event.target as HTMLInputElement).value
              ? Number(($event.target as HTMLInputElement).value)
              : undefined
          )
        "
        :min="0"
        :step="integer ? 1 : undefined"
        :placeholder="t.numberMultipleOfPlaceholder"
        :disabled="readOnly"
        :class="numInputClass"
      />
      <div v-if="!!multipleOfError" class="
        text-xs whitespace-pre-line text-red-500 italic
      ">
        {{ multipleOfError }}
      </div>
    </div>

    <div v-if="!readOnly || enumValues.length > 0" class="
      space-y-2 border-t border-border pt-2
    ">
      <label :class="['text-sm font-medium', !!enumError && 'text-red-500']">{{
        t.numberAllowedValuesEnumLabel
      }}</label>
      <div class="mb-4 flex flex-wrap gap-2">
        <template v-if="enumValues.length > 0">
          <span
            v-for="(value, index) in enumValues"
            :key="index"
            class="
              inline-flex items-center gap-1 rounded-full bg-secondary px-2.5
              py-0.5 text-xs font-medium
            "
          >
            {{ value }}
            <button
              v-if="!readOnly"
              type="button"
              @click="handleRemoveEnumValue(index)"
              class="hover:text-destructive"
            >
              <XIcon class="size-3" />
            </button>
          </span>
        </template>
        <p v-else class="text-xs text-muted-foreground italic">
          {{ t.numberAllowedValuesEnumNone }}
        </p>
      </div>
      <div v-if="!readOnly" class="flex items-center gap-2">
        <input
          type="number"
          :value="enumValue ? Number(enumValue) : ''"
          @input="enumValue = ($event.target as HTMLInputElement).value"
          :placeholder="t.numberAllowedValuesEnumAddPlaceholder"
          :step="integer ? 1 : undefined"
          :class="[numInputClass, 'flex-1']"
          @keydown.enter="handleAddEnumValue()"
        />
        <button
          type="button"
          @click="handleAddEnumValue()"
          class="
            inline-flex h-8 items-center justify-center gap-2 rounded-md border
            bg-background px-3 text-sm font-medium whitespace-nowrap shadow-xs
            transition-all
            hover:bg-accent hover:text-accent-foreground
          "
        >
          <PlusIcon class="size-3" /> {{ t.numberAllowedValuesEnumAddLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
