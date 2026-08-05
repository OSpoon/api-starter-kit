<script setup lang="ts">
import type { SchemaType } from '@/components/json-schema/types/jsonSchema.ts'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

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
</script>

<template>
  <ToggleGroup
    :id="id"
    type="single"
    :model-value="modelValue"
    variant="outline"
    size="sm"
    :spacing="8"
    class="grid grid-cols-1 gap-2 xs:grid-cols-2 md:grid-cols-3"
    @update:model-value="$emit('update:modelValue', $event as SchemaType)"
  >
    <ToggleGroupItem
      v-for="type in typeOptions"
      :key="type.id"
      :value="type.id"
      :title="type.description"
      class="h-auto justify-start rounded-lg p-2.5 text-left whitespace-normal"
    >
      <div class="text-sm font-medium">{{ type.label }}</div>
      <div class="line-clamp-1 text-xs text-muted-foreground">{{ type.description }}</div>
    </ToggleGroupItem>
  </ToggleGroup>
</template>
