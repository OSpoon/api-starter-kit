<script setup lang="ts">
import { cn } from '@/components/json-schema/lib/utils.ts'
import { getTypeColor, getTypeLabel } from '@/components/json-schema/lib/utils.ts'
import type { SchemaType } from '@/components/json-schema/types/jsonSchema.ts'
import { NativeSelect } from '@/components/ui/native-select'

const props = withDefaults(
  defineProps<{ modelValue: SchemaType; class?: string; readOnly?: boolean }>(),
  { readOnly: false }
)
const emit = defineEmits<{ 'update:modelValue': [value: SchemaType] }>()

const typeOptions: SchemaType[] = ['string', 'number', 'boolean', 'object', 'array', 'null']

const options = computed(() =>
  typeOptions.map((type) => ({ value: type, label: getTypeLabel(type), color: getTypeColor(type) }))
)
</script>

<template>
  <NativeSelect
    :model-value="modelValue"
    size="sm"
    :disabled="readOnly"
    @update:model-value="emit('update:modelValue', $event as SchemaType)"
    :class="
      cn(
        `
          min-w-23 rounded-md border border-input bg-transparent px-2 py-1
          text-xs font-medium
        `,
        `
          outline-none
          focus-visible:border-ring focus-visible:ring-3
          focus-visible:ring-ring/50
        `,
        'disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
  >
    <option v-for="opt in options" :key="opt.value" :value="opt.value" :class="opt.color">
      {{ opt.label }}
    </option>
  </NativeSelect>
</template>
