<script setup lang="ts">
import type { SchemaType } from '@/components/json-schema/types/jsonSchema.ts'

interface TypeOption {
  id: SchemaType
  label: string
  description: string
}

const typeOptions: TypeOption[] = [
  { id: 'string', label: 'Text', description: 'For text values like names, descriptions, etc.' },
  { id: 'number', label: 'Number', description: 'For decimal or whole numbers' },
  { id: 'boolean', label: 'Yes/No', description: 'For true/false values' },
  { id: 'object', label: 'Group', description: 'For grouping related fields together' },
  { id: 'array', label: 'List', description: 'For collections of items' },
]

defineProps<{ id?: string; modelValue: SchemaType }>()
const emit = defineEmits<{ 'update:modelValue': [value: SchemaType] }>()
</script>

<template>
  <div :id="id" class="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-2">
    <button
      v-for="type in typeOptions"
      :key="type.id"
      type="button"
      :title="type.description"
      :class="[
        'p-2.5 rounded-lg border-2 text-left transition-all duration-200',
        modelValue === type.id
          ? 'border-primary bg-primary/5 shadow-xs'
          : 'border-border hover:border-primary/30 hover:bg-secondary',
      ]"
      @click="emit('update:modelValue', type.id)"
    >
      <div class="font-medium text-sm">{{ type.label }}</div>
      <div class="text-xs text-muted-foreground line-clamp-1">{{ type.description }}</div>
    </button>
  </div>
</template>
