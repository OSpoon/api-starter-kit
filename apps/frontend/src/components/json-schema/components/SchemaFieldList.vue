<script setup lang="ts">
import { computed } from 'vue'

import { useSchemaStore } from '@/components/json-schema/hooks/useSchemaStore.ts'
import { useTranslation } from '@/components/json-schema/hooks/useTranslation.ts'
import { getSchemaProperties } from '@/components/json-schema/lib/schemaEditor.ts'
import { buildValidationTree } from '@/components/json-schema/types/validation.ts'

import SchemaPropertyEditor from './SchemaPropertyEditor.vue'

const props = withDefaults(defineProps<{ path: string[]; readOnly?: boolean }>(), {
  readOnly: false,
})
const store = useSchemaStore()
const t = useTranslation()

const parentSchema = computed(() => {
  if (props.path.length === 0) return store.schema.value
  return store.getAtPath(props.path) ?? { type: 'object' as const, properties: {} }
})

const properties = computed(() => getSchemaProperties(parentSchema.value))
const validationTree = computed(() => buildValidationTree(parentSchema.value, t))
</script>

<template>
  <div class="space-y-2">
    <SchemaPropertyEditor
      v-for="property in properties"
      :key="property.name"
      :path="path"
      :name="property.name"
      :schema="property.schema"
      :required="property.required"
      :validation-node="validationTree.children[property.name] ?? undefined"
      :read-only="readOnly"
    />
  </div>
</template>
