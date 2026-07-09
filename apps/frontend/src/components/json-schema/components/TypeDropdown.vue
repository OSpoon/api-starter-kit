<script setup lang="ts">
import { computed } from 'vue'

import { cn } from '@/components/json-schema/lib/utils.ts'
import { getTypeColor, getTypeLabel } from '@/components/json-schema/lib/utils.ts'
import type { SchemaType } from '@/components/json-schema/types/jsonSchema.ts'

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
  <select
    :value="modelValue"
    :disabled="readOnly"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value as SchemaType)"
    :class="
      cn(
        'text-xs font-medium rounded-md border border-input bg-transparent px-2 py-1 min-w-[92px]',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
  >
    <option v-for="opt in options" :key="opt.value" :value="opt.value" :class="opt.color">
      {{ opt.label }}
    </option>
  </select>
</template>
