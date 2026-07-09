import { inject, type InjectionKey, provide, type ShallowRef, shallowRef } from 'vue'

import type {
  JSONSchema,
  NewField,
  ObjectJSONSchema,
} from '@/components/json-schema/types/jsonSchema.ts'
import { isObjectSchema } from '@/components/json-schema/types/jsonSchema.ts'

export interface SchemaStore {
  schema: ShallowRef<JSONSchema>
  getAtPath(path: string[]): JSONSchema | undefined
  updateProperty(path: string[], propertyName: string, propertySchema: JSONSchema): void
  deleteProperty(path: string[], propertyName: string): void
  renameProperty(path: string[], oldName: string, newName: string): void
  setPropertyRequired(path: string[], propertyName: string, required: boolean): void
  addProperty(path: string[], field: NewField): void
  replaceSchema(newSchema: JSONSchema): void
}

export const SchemaStoreKey: InjectionKey<SchemaStore> = Symbol('SchemaStore')

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function navigateToPath(root: JSONSchema, path: string[]): ObjectJSONSchema | undefined {
  let current: JSONSchema = root
  for (const segment of path) {
    if (!isObjectSchema(current) || !current.properties) return undefined
    const next = current.properties[segment]
    if (next === undefined) return undefined
    if (isObjectSchema(next) && next.type === 'array' && next.items && isObjectSchema(next.items)) {
      current = next.items
    } else {
      current = next
    }
  }
  return isObjectSchema(current) ? current : undefined
}

function getSubSchema(root: JSONSchema, path: string[]): JSONSchema | undefined {
  if (path.length === 0) return root
  let current: JSONSchema = root
  for (const segment of path) {
    if (!isObjectSchema(current) || !current.properties) return undefined
    const next = current.properties[segment]
    if (next === undefined) return undefined
    current = next
  }
  return current
}

function setDeep(
  root: JSONSchema,
  path: string[],
  propertyName: string,
  propertySchema: JSONSchema
): JSONSchema {
  const newRoot = clone(root)
  const parent = path.length === 0 ? newRoot : navigateToPath(newRoot, path)
  if (!parent || !isObjectSchema(parent)) return newRoot
  if (!parent.properties) parent.properties = {}
  parent.properties[propertyName] = propertySchema
  return newRoot
}

function deleteDeep(root: JSONSchema, path: string[], propertyName: string): JSONSchema {
  const newRoot = clone(root)
  const parent = path.length === 0 ? newRoot : navigateToPath(newRoot, path)
  if (!parent || !isObjectSchema(parent) || !parent.properties) return newRoot
  const { [propertyName]: _, ...rest } = parent.properties
  parent.properties = rest
  if (parent.required) {
    parent.required = parent.required.filter((n) => n !== propertyName)
  }
  return newRoot
}

function renameDeep(
  root: JSONSchema,
  path: string[],
  oldName: string,
  newName: string
): JSONSchema {
  const newRoot = clone(root)
  const parent = path.length === 0 ? newRoot : navigateToPath(newRoot, path)
  if (!parent || !isObjectSchema(parent) || !parent.properties) return newRoot
  const newProps: Record<string, JSONSchema> = {}
  for (const [key, value] of Object.entries(parent.properties)) {
    newProps[key === oldName ? newName : key] = value
  }
  parent.properties = newProps
  if (parent.required) {
    parent.required = parent.required.map((n) => (n === oldName ? newName : n))
  }
  return newRoot
}

function setRequiredDeep(
  root: JSONSchema,
  path: string[],
  propertyName: string,
  required: boolean
): JSONSchema {
  const newRoot = clone(root)
  const parent = path.length === 0 ? newRoot : navigateToPath(newRoot, path)
  if (!parent || !isObjectSchema(parent)) return newRoot
  if (!parent.required) parent.required = []
  if (required) {
    if (!parent.required.includes(propertyName)) {
      parent.required.push(propertyName)
    }
  } else {
    parent.required = parent.required.filter((n) => n !== propertyName)
  }
  return newRoot
}

export function createSchemaStore(
  initialSchema: JSONSchema,
  onChange?: (schema: JSONSchema) => void
): SchemaStore {
  const schema = shallowRef<JSONSchema>(clone(initialSchema))
  const MAX_COMMITS_PER_BATCH = 10
  let commitCount = 0
  let batchScheduled = false

  function resetCommitCount(): void {
    commitCount = 0
    batchScheduled = false
  }

  let isUpdating = false

  function commit(newSchema: JSONSchema): void {
    if (isUpdating) return
    if (!batchScheduled) {
      batchScheduled = true
      setTimeout(resetCommitCount, 0)
    }
    commitCount++
    if (commitCount > MAX_COMMITS_PER_BATCH) {
      console.warn('[SchemaStore] commit rate limit reached -- dropping update to prevent loop')
      return
    }
    isUpdating = true
    try {
      schema.value = newSchema
      onChange?.(newSchema)
    } finally {
      isUpdating = false
    }
  }

  const store: SchemaStore = {
    schema,
    getAtPath(path: string[]): JSONSchema | undefined {
      return getSubSchema(schema.value, path)
    },
    updateProperty(path: string[], propertyName: string, propertySchema: JSONSchema): void {
      commit(setDeep(schema.value, path, propertyName, clone(propertySchema)))
    },
    deleteProperty(path: string[], propertyName: string): void {
      commit(deleteDeep(schema.value, path, propertyName))
    },
    renameProperty(path: string[], oldName: string, newName: string): void {
      commit(renameDeep(schema.value, path, oldName, newName))
    },
    setPropertyRequired(path: string[], propertyName: string, required: boolean): void {
      commit(setRequiredDeep(schema.value, path, propertyName, required))
    },
    addProperty(path: string[], field: NewField): void {
      const { type, description, additionalProperties } = field
      const fieldSchema: ObjectJSONSchema = {
        type,
        ...(description ? { description } : {}),
        ...(additionalProperties === false ? { additionalProperties } : {}),
      }
      let newSchema = setDeep(schema.value, path, field.name, fieldSchema)
      if (field.required) {
        newSchema = setRequiredDeep(newSchema, path, field.name, true)
      }
      commit(newSchema)
    },
    replaceSchema(newSchema: JSONSchema): void {
      commit(clone(newSchema))
    },
  }
  return store
}

export function provideSchemaStore(store: SchemaStore): void {
  provide(SchemaStoreKey, store)
}

export function useSchemaStore(): SchemaStore {
  const store = inject(SchemaStoreKey)
  if (!store) {
    throw new Error('useSchemaStore() was called without a parent providing SchemaStore.')
  }
  return store
}

export const _testing = {
  clone,
  navigateToPath,
  getSubSchema,
  setDeep,
  deleteDeep,
  renameDeep,
  setRequiredDeep,
}
