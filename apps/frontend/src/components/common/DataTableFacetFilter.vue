<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type DataTableFacetFilterOption = {
  value: string
  label: string
}

const props = defineProps<{
  label: string
  options: DataTableFacetFilterOption[]
}>()

const selectedValues = defineModel<string[]>({ default: () => [] })
const { t } = useI18n()
const id = useId()
const open = ref(false)
const selectedLabels = computed(() =>
  props.options
    .filter((option) => selectedValues.value.includes(option.value))
    .map((option) => option.label)
    .join(', ')
)

function clear() {
  selectedValues.value = []
  open.value = false
}
</script>

<template>
  <div class="grid w-full min-w-0 gap-1.5 text-sm font-normal">
    <Label :for="id" class="font-normal whitespace-nowrap">{{ label }}</Label>
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button
          :id="id"
          type="button"
          variant="outline"
          class="h-9 w-full min-w-0 justify-between font-normal"
          :aria-label="label"
        >
          <span class="truncate text-left">{{ selectedLabels || t('common.all') }}</span>
          <ChevronDown class="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" class="w-[var(--reka-popover-trigger-width)] p-0">
        <Command v-model="selectedValues" multiple>
          <CommandInput
            :aria-label="t('common.search')"
            :placeholder="t('common.search_placeholder')"
          />
          <CommandList>
            <CommandEmpty>{{ t('common.no_data') }}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                class="[&>svg:last-child]:hidden"
                @select.prevent="clear"
              >
                <Checkbox
                  :model-value="selectedValues.length === 0"
                  aria-hidden="true"
                  tabindex="-1"
                  class="pointer-events-none"
                />
                {{ t('common.all') }}
              </CommandItem>
              <CommandSeparator />
              <CommandItem
                v-for="option in options"
                :key="option.value"
                :value="option.value"
                class="[&>svg:last-child]:hidden"
              >
                <Checkbox
                  :model-value="selectedValues.includes(option.value)"
                  aria-hidden="true"
                  tabindex="-1"
                  class="pointer-events-none"
                />
                {{ option.label }}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </div>
</template>
