<script setup lang="ts">
import { CircleHelpIcon, CirclePlusIcon, InfoIcon } from '@lucide/vue'

import { useSchemaStore } from '@/components/json-schema/hooks/useSchemaStore.ts'
import { useTranslation } from '@/components/json-schema/hooks/useTranslation.ts'
import type { SchemaType } from '@/components/json-schema/types/jsonSchema.ts'

import SchemaTypeSelector from './SchemaTypeSelector.vue'

const props = withDefaults(defineProps<{ path: string[]; variant?: 'primary' | 'secondary' }>(), {
  variant: 'primary',
})
const store = useSchemaStore()

const dialogOpen = ref(false)
const fieldName = ref('')
const fieldType = ref<SchemaType>('string')
const fieldDesc = ref('')
const fieldRequired = ref(false)
const additionalProperties = ref(true)

const fieldNameId = useId()
const fieldDescId = useId()
const fieldRequiredId = useId()
const fieldTypeId = useId()
const additionalPropertiesId = useId()
const t = useTranslation()

const handleSubmit = (e: Event) => {
  e.preventDefault()
  if (!fieldName.value.trim()) return
  store.addProperty(props.path, {
    name: fieldName.value,
    type: fieldType.value,
    description: fieldDesc.value,
    required: fieldRequired.value,
    additionalProperties: fieldType.value === 'object' ? additionalProperties.value : undefined,
  })
  fieldName.value = ''
  fieldType.value = 'string'
  fieldDesc.value = ''
  fieldRequired.value = false
  additionalProperties.value = true
  dialogOpen.value = false
}
</script>

<template>
  <button
    type="button"
    @click="dialogOpen = true"
    :class="[
      'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all h-8 px-3',
      variant === 'primary'
        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
        : 'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
    ]"
  >
    <CirclePlusIcon class="size-4" /> <span>{{ t.fieldAddNewButton }}</span>
  </button>

  <div
    v-if="dialogOpen"
    class="fixed inset-0 z-50 flex items-center justify-center"
    @click.self="dialogOpen = false"
  >
    <div class="fixed inset-0 bg-black/50" />
    <div
      class="relative bg-popover text-popover-foreground rounded-xl p-6 shadow-lg w-[95vw] max-w-[800px] max-h-[85vh] overflow-y-auto"
    >
      <div class="mb-4">
        <div class="text-xl flex flex-wrap items-center gap-2">
          {{ t.fieldAddNewLabel }}
          <span
            class="inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground"
            >{{ t.fieldAddNewBadge }}</span
          >
        </div>
        <p class="text-sm text-muted-foreground mt-1">{{ t.fieldAddNewDescription }}</p>
      </div>

      <form @submit="handleSubmit" class="space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="space-y-4 min-w-[280px]">
            <div>
              <div class="flex items-center gap-2 mb-1.5">
                <label :for="fieldNameId" class="text-sm font-medium">{{ t.fieldNameLabel }}</label>
                <InfoIcon class="size-4 text-muted-foreground shrink-0" />
              </div>
              <input
                :id="fieldNameId"
                v-model="fieldName"
                :placeholder="t.fieldNamePlaceholder"
                required
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 outline-none font-mono"
              />
            </div>
            <div>
              <div class="flex items-center gap-2 mb-1.5">
                <label :for="fieldDescId" class="text-sm font-medium">{{
                  t.fieldDescription
                }}</label>
                <InfoIcon class="size-4 text-muted-foreground shrink-0" />
              </div>
              <input
                :id="fieldDescId"
                v-model="fieldDesc"
                :placeholder="t.fieldDescriptionPlaceholder"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 outline-none"
              />
            </div>
            <label class="flex items-center gap-3 p-3 rounded-lg border bg-muted/50 cursor-pointer">
              <input
                type="checkbox"
                :id="fieldRequiredId"
                v-model="fieldRequired"
                class="rounded border-gray-300 shrink-0 text-primary focus:ring-primary"
              />
              <span class="text-sm">{{ t.fieldRequiredLabel }}</span>
            </label>
            <label
              v-if="fieldType === 'object'"
              class="flex items-center gap-3 p-3 rounded-lg border bg-muted/50 cursor-pointer"
            >
              <input
                type="checkbox"
                :id="additionalPropertiesId"
                v-model="additionalProperties"
                class="rounded border-gray-300 shrink-0 text-primary focus:ring-primary"
              />
              <span class="text-sm">{{ t.additionalPropertiesAllow }}</span>
              <InfoIcon class="size-4 text-muted-foreground shrink-0" />
            </label>
          </div>
          <div class="space-y-4 min-w-[280px]">
            <div>
              <div class="flex items-center gap-2 mb-1.5">
                <label :for="fieldTypeId" class="text-sm font-medium">{{ t.fieldType }}</label>
                <CircleHelpIcon class="size-4 text-muted-foreground shrink-0" />
              </div>
              <SchemaTypeSelector :id="fieldTypeId" v-model="fieldType" />
            </div>
            <div class="rounded-lg border bg-muted/50 p-3 hidden md:block">
              <p class="text-xs font-medium mb-2">{{ t.fieldTypeExample }}</p>
              <code class="text-sm bg-background/80 p-2 rounded block overflow-x-auto">
                <template v-if="fieldType === 'string'">"example"</template>
                <template v-else-if="fieldType === 'number'">42</template>
                <template v-else-if="fieldType === 'boolean'">true</template>
                <template v-else-if="fieldType === 'object'">{ "key": "value" }</template>
                <template v-else-if="fieldType === 'array'">["item1", "item2"]</template>
              </code>
            </div>
          </div>
        </div>
        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            @click="dialogOpen = false"
            class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all h-9 px-4 border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground"
          >
            {{ t.fieldAddNewCancel }}
          </button>
          <button
            type="submit"
            class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {{ t.fieldAddNewConfirm }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
