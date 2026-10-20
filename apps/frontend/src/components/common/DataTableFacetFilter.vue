<script setup lang="ts">
import { Plus } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type DataTableFacetFilterOption = {
  value: string
  label: string
}

withDefaults(
  defineProps<{
    label: string
    options: DataTableFacetFilterOption[]
    compact?: boolean
  }>(),
  { compact: false }
)

const selectedValues = defineModel<string[]>({ default: () => [] })
const { t } = useI18n()

function toggle(value: string) {
  selectedValues.value = selectedValues.value.includes(value)
    ? selectedValues.value.filter((item) => item !== value)
    : [...selectedValues.value, value]
}
</script>

<template>
  <template v-if="compact">
    <DropdownMenuLabel>{{ label }}</DropdownMenuLabel>
    <DropdownMenuCheckboxItem
      :checked="selectedValues.length === 0"
      @select.prevent="selectedValues = []"
    >
      {{ t('common.all') }}
    </DropdownMenuCheckboxItem>
    <DropdownMenuSeparator />
    <DropdownMenuCheckboxItem
      v-for="option in options"
      :key="option.value"
      :checked="selectedValues.includes(option.value)"
      @select.prevent="toggle(option.value)"
    >
      {{ option.label }}
    </DropdownMenuCheckboxItem>
  </template>
  <DropdownMenu v-else>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" class="h-9 shrink-0 border-dashed" :aria-label="label">
        <Plus class="size-4" />
        {{ label }}
        <span
          v-if="selectedValues.length"
          class="ml-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs tabular-nums"
        >
          {{ selectedValues.length }}
        </span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="max-h-80 w-60 overflow-y-auto">
      <DropdownMenuCheckboxItem
        :checked="selectedValues.length === 0"
        @select.prevent="selectedValues = []"
      >
        {{ t('common.all') }}
      </DropdownMenuCheckboxItem>
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem
        v-for="option in options"
        :key="option.value"
        :checked="selectedValues.includes(option.value)"
        @select.prevent="toggle(option.value)"
      >
        {{ option.label }}
      </DropdownMenuCheckboxItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
