<script setup lang="ts">
import PageShell from '@/components/common/PageShell.vue'
import JsonSchemaEditor from '@/components/json-schema/components/JsonSchemaEditor.vue'
import {
  createSchemaStore,
  provideSchemaStore,
} from '@/components/json-schema/hooks/useSchemaStore.ts'
import { useTranslation } from '@/components/json-schema/hooks/useTranslation.ts'
import type { JSONSchema } from '@/components/json-schema/types/jsonSchema.ts'

const t = useTranslation()

const initialSchema: JSONSchema = {
  type: 'object',
  title: 'Example Schema',
  description: 'A sample schema to demonstrate the editor',
  properties: {
    name: {
      type: 'string',
      title: 'Name',
      description: "The user's full name",
      minLength: 2,
      maxLength: 100,
    },
    age: { type: 'number', title: 'Age', description: 'Age in years', minimum: 0, maximum: 150 },
    email: {
      type: 'string',
      title: 'Email',
      format: 'email',
      description: 'Primary email address',
    },
    isActive: { type: 'boolean', title: 'Active', description: 'Whether the user is active' },
    tags: {
      type: 'array',
      title: 'Tags',
      description: 'User tags',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 10,
      uniqueItems: true,
    },
    address: {
      type: 'object',
      title: 'Address',
      description: 'Physical address',
      properties: {
        street: { type: 'string', title: 'Street' },
        city: { type: 'string', title: 'City' },
        zip: { type: 'string', title: 'ZIP Code', pattern: '^[0-9]{5}$' },
      },
      required: ['street', 'city'],
      additionalProperties: false,
    },
  },
  required: ['name', 'email'],
}

onBeforeMount(() => {
  provideSchemaStore(createSchemaStore(initialSchema))
})
</script>

<template>
  <PageShell :title="t.schemaDemoTitle ?? ''" :description="t.schemaDemoDescription" class="gap-4">
    <div class="min-h-0 flex-1">
      <JsonSchemaEditor />
    </div>
  </PageShell>
</template>
