<script setup lang="ts">
import { useSchemaStore } from '@/components/json-schema/hooks/useSchemaStore.ts'
import { useTranslation } from '@/components/json-schema/hooks/useTranslation.ts'
import { isBooleanSchema, isObjectSchema } from '@/components/json-schema/types/jsonSchema.ts'

import AddFieldButton from './AddFieldButton.vue'
import SchemaFieldList from './SchemaFieldList.vue'

withDefaults(defineProps<{ readOnly?: boolean }>(), { readOnly: false })

const t = useTranslation()
const store = useSchemaStore()
const schema = computed(() => store.schema.value)

const hasFields = () =>
  !isBooleanSchema(schema.value) &&
  isObjectSchema(schema.value) &&
  schema.value.properties &&
  Object.keys(schema.value.properties).length > 0
</script>

<template>
  <div class="p-4 h-full flex flex-col overflow-auto">
    <div v-if="!readOnly" class="mb-6 shrink-0">
      <AddFieldButton :path="[]" />
    </div>
    <div class="grow overflow-auto">
      <div v-if="!hasFields()" class="text-center py-10 text-muted-foreground">
        <p class="mb-3">{{ t.visualEditorNoFieldsHint1 }}</p>
        <p class="text-sm">{{ t.visualEditorNoFieldsHint2 }}</p>
      </div>
      <SchemaFieldList v-else :path="[]" :read-only="readOnly" />
    </div>
  </div>
</template>
