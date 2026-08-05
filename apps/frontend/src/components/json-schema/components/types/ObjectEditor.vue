<script setup lang="ts">
import AddFieldButton from '@/components/json-schema/components/AddFieldButton.vue'
import SchemaPropertyEditor from '@/components/json-schema/components/SchemaPropertyEditor.vue'
import { useSchemaStore } from '@/components/json-schema/hooks/useSchemaStore.ts'
import { useTranslation } from '@/components/json-schema/hooks/useTranslation.ts'
import { getSchemaProperties } from '@/components/json-schema/lib/schemaEditor.ts'
import type { JSONSchema } from '@/components/json-schema/types/jsonSchema.ts'
import { isBooleanSchema } from '@/components/json-schema/types/jsonSchema.ts'
import type { ValidationTreeNode } from '@/components/json-schema/types/validation.ts'
import { Button } from '@/components/ui/button'

const props = withDefaults(
  defineProps<{
    schema: JSONSchema
    path: string[]
    readOnly?: boolean
    validationNode?: ValidationTreeNode
    depth?: number
  }>(),
  { readOnly: false, depth: 0 }
)

const store = useSchemaStore()
const t = useTranslation()
const properties = computed(() => getSchemaProperties(props.schema))

const isAdditionalPropertiesForbidden = computed(() => {
  if (isBooleanSchema(props.schema)) return false
  return props.schema.additionalProperties === false
})

const handleAdditionalPropertiesToggle = () => {
  const current = store.getAtPath(props.path)
  if (!current || isBooleanSchema(current)) return
  const plain = JSON.parse(JSON.stringify(current))
  if (plain.additionalProperties !== false) {
    plain.additionalProperties = false
  } else {
    delete plain.additionalProperties
  }
  if (props.path.length > 0) {
    const parentPath = props.path.slice(0, -1)
    const propertyName = props.path[props.path.length - 1]!
    store.updateProperty(parentPath, propertyName, plain)
  } else {
    store.replaceSchema(plain)
  }
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="properties.length > 0" class="space-y-2">
      <SchemaPropertyEditor
        v-for="property in properties"
        :key="property.name"
        :read-only="readOnly"
        :path="path"
        :name="property.name"
        :schema="property.schema"
        :required="property.required"
        :validation-node="validationNode?.children[property.name]"
        :depth="depth"
      />
    </div>
    <div v-else class="rounded-md border p-2 text-center text-sm text-muted-foreground italic">
      {{ t.objectPropertiesNone }}
    </div>

    <div v-if="!readOnly" class="mt-4 flex flex-row gap-x-4">
      <AddFieldButton :path="path" variant="secondary" />
      <Button
        variant="secondary"
        size="sm"
        type="button"
        @click="handleAdditionalPropertiesToggle()"
        :class="[
          `
            inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs
            font-medium transition-colors
          `,
          isAdditionalPropertiesForbidden
            ? 'bg-amber-50 text-amber-600'
            : 'bg-lime-50 text-lime-600',
        ]"
      >
        {{
          isAdditionalPropertiesForbidden
            ? t.additionalPropertiesForbid
            : t.additionalPropertiesAllow
        }}
      </Button>
    </div>
  </div>
</template>
