<script setup lang="ts">
import type {
  JSONSchema,
  ObjectJSONSchema,
  SchemaType,
} from '@/components/json-schema/types/jsonSchema.ts'
import { withObjectSchema } from '@/components/json-schema/types/jsonSchema.ts'
import type { ValidationTreeNode } from '@/components/json-schema/types/validation.ts'

import ArrayEditor from './types/ArrayEditor.vue'
import BooleanEditor from './types/BooleanEditor.vue'
import NumberEditor from './types/NumberEditor.vue'
import ObjectEditor from './types/ObjectEditor.vue'
import StringEditor from './types/StringEditor.vue'

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
const emit = defineEmits<{ change: [schema: ObjectJSONSchema] }>()

const getType = () =>
  withObjectSchema(props.schema, (s) => (s.type || 'object') as SchemaType, 'string' as SchemaType)
</script>

<template>
  <StringEditor
    v-if="getType() === 'string'"
    :schema="schema"
    :path="path"
    :read-only="readOnly"
    :validation-node="validationNode"
    :depth="depth"
    @change="emit('change', $event)"
  />
  <NumberEditor
    v-else-if="getType() === 'number'"
    :schema="schema"
    :path="path"
    :read-only="readOnly"
    :validation-node="validationNode"
    :depth="depth"
    @change="emit('change', $event)"
  />
  <NumberEditor
    v-else-if="getType() === 'integer'"
    :schema="schema"
    :path="path"
    :read-only="readOnly"
    :validation-node="validationNode"
    :depth="depth"
    :integer="true"
    @change="emit('change', $event)"
  />
  <BooleanEditor
    v-else-if="getType() === 'boolean'"
    :schema="schema"
    :path="path"
    :read-only="readOnly"
    :validation-node="validationNode"
    :depth="depth"
    @change="emit('change', $event)"
  />
  <ObjectEditor
    v-else-if="getType() === 'object'"
    :schema="schema"
    :path="path"
    :read-only="readOnly"
    :validation-node="validationNode"
    :depth="depth"
  />
  <ArrayEditor
    v-else-if="getType() === 'array'"
    :schema="schema"
    :path="path"
    :read-only="readOnly"
    :validation-node="validationNode"
    :depth="depth"
    @change="emit('change', $event)"
  />
</template>
