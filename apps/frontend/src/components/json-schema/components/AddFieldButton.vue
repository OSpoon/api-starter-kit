<script setup lang="ts">
import { CircleHelpIcon, CirclePlusIcon, InfoIcon } from '@lucide/vue'

import { useSchemaStore } from '@/components/json-schema/hooks/useSchemaStore.ts'
import { useTranslation } from '@/components/json-schema/hooks/useTranslation.ts'
import type { SchemaType } from '@/components/json-schema/types/jsonSchema.ts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

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
  <Button
    :variant="variant === 'primary' ? 'default' : 'outline'"
    size="sm"
    type="button"
    @click="dialogOpen = true"
  >
    <CirclePlusIcon class="size-4" /> <span>{{ t.fieldAddNewButton }}</span>
  </Button>

  <div
    v-if="dialogOpen"
    class="fixed inset-0 z-50 flex items-center justify-center"
    @click.self="dialogOpen = false"
  >
    <div class="fixed inset-0 bg-black/50" />
    <div
      class="relative max-h-[85vh] w-[95vw] max-w-200 overflow-y-auto rounded-xl bg-popover p-6 text-popover-foreground shadow-lg"
    >
      <div class="mb-4">
        <div class="flex flex-wrap items-center gap-2 text-xl">
          {{ t.fieldAddNewLabel }}
          <span
            class="inline-flex items-center justify-center rounded-full border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
            >{{ t.fieldAddNewBadge }}</span
          >
        </div>
        <p class="mt-1 text-sm text-muted-foreground">{{ t.fieldAddNewDescription }}</p>
      </div>

      <form @submit="handleSubmit" class="space-y-6">
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div class="min-w-70 space-y-4">
            <div>
              <div class="mb-1.5 flex items-center gap-2">
                <label :for="fieldNameId" class="text-sm font-medium">{{ t.fieldNameLabel }}</label>
                <InfoIcon class="size-4 shrink-0 text-muted-foreground" />
              </div>
              <Input
                :id="fieldNameId"
                v-model="fieldName"
                :placeholder="t.fieldNamePlaceholder"
                required
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 font-mono text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <div>
              <div class="mb-1.5 flex items-center gap-2">
                <label :for="fieldDescId" class="text-sm font-medium">{{
                  t.fieldDescription
                }}</label>
                <InfoIcon class="size-4 shrink-0 text-muted-foreground" />
              </div>
              <Input
                :id="fieldDescId"
                v-model="fieldDesc"
                :placeholder="t.fieldDescriptionPlaceholder"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <label class="flex cursor-pointer items-center gap-3 rounded-lg border bg-muted/50 p-3">
              <Checkbox
                :id="fieldRequiredId"
                v-model="fieldRequired"
                class="shrink-0 rounded-sm border-gray-300 text-primary focus:ring-primary"
              />
              <span class="text-sm">{{ t.fieldRequiredLabel }}</span>
            </label>
            <label
              v-if="fieldType === 'object'"
              class="flex cursor-pointer items-center gap-3 rounded-lg border bg-muted/50 p-3"
            >
              <Checkbox
                :id="additionalPropertiesId"
                v-model="additionalProperties"
                class="shrink-0 rounded-sm border-gray-300 text-primary focus:ring-primary"
              />
              <span class="text-sm">{{ t.additionalPropertiesAllow }}</span>
              <InfoIcon class="size-4 shrink-0 text-muted-foreground" />
            </label>
          </div>
          <div class="min-w-70 space-y-4">
            <div>
              <div class="mb-1.5 flex items-center gap-2">
                <label :for="fieldTypeId" class="text-sm font-medium">{{ t.fieldType }}</label>
                <CircleHelpIcon class="size-4 shrink-0 text-muted-foreground" />
              </div>
              <SchemaTypeSelector :id="fieldTypeId" v-model="fieldType" />
            </div>
            <div class="hidden rounded-lg border bg-muted/50 p-3 md:block">
              <p class="mb-2 text-xs font-medium">{{ t.fieldTypeExample }}</p>
              <code class="block overflow-x-auto rounded-sm bg-background/80 p-2 text-sm">
                <template v-if="fieldType === 'string'">"example"</template>
                <template v-else-if="fieldType === 'number'">42</template>
                <template v-else-if="fieldType === 'boolean'">true</template>
                <template v-else-if="fieldType === 'object'">{ "key": "value" }</template>
                <template v-else-if="fieldType === 'array'">["item1", "item2"]</template>
              </code>
            </div>
          </div>
        </div>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" type="button" @click="dialogOpen = false">
            {{ t.fieldAddNewCancel }}
          </Button>
          <Button variant="default" type="submit">
            {{ t.fieldAddNewConfirm }}
          </Button>
        </div>
      </form>
    </div>
  </div>
</template>
