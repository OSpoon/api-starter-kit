import type {
  JSONSchema,
  NewField,
  ObjectJSONSchema,
} from '@/components/json-schema/types/jsonSchema.ts'
import { isBooleanSchema, isObjectSchema } from '@/components/json-schema/types/jsonSchema.ts'

export type Property = { name: string; schema: JSONSchema; required: boolean }

export function copySchema<T extends JSONSchema>(schema: T): T {
  return JSON.parse(JSON.stringify(schema))
}

export function updateObjectProperty(
  schema: ObjectJSONSchema,
  propertyName: string,
  propertySchema: JSONSchema
): ObjectJSONSchema {
  if (!isObjectSchema(schema)) return schema
  const newSchema = copySchema(schema)
  if (!newSchema.properties) {
    newSchema.properties = {}
  }
  newSchema.properties[propertyName] = propertySchema
  return newSchema
}

export function removeObjectProperty(
  schema: ObjectJSONSchema,
  propertyName: string
): ObjectJSONSchema {
  if (!isObjectSchema(schema) || !schema.properties) return schema
  const newSchema = copySchema(schema)
  const { [propertyName]: _, ...remainingProps } = newSchema.properties || {}
  newSchema.properties = remainingProps
  if (newSchema.required) {
    newSchema.required = newSchema.required.filter((name) => name !== propertyName)
  }
  return newSchema
}

export function updatePropertyRequired(
  schema: ObjectJSONSchema,
  propertyName: string,
  required: boolean
): ObjectJSONSchema {
  if (!isObjectSchema(schema)) return schema
  const newSchema = copySchema(schema)
  if (!newSchema.required) {
    newSchema.required = []
  }
  if (required) {
    if (!newSchema.required.includes(propertyName)) {
      newSchema.required.push(propertyName)
    }
  } else {
    newSchema.required = newSchema.required.filter((name) => name !== propertyName)
  }
  return newSchema
}

export function updateArrayItems(schema: JSONSchema, itemsSchema: JSONSchema): JSONSchema {
  if (isObjectSchema(schema) && schema.type === 'array') {
    return { ...schema, items: itemsSchema }
  }
  return schema
}

export function createFieldSchema(field: NewField): JSONSchema {
  const { type, description, validation, additionalProperties } = field
  if (validation && isObjectSchema(validation)) {
    return {
      type,
      description,
      ...validation,
      ...(additionalProperties === false ? { additionalProperties } : {}),
    }
  }
  return { type }
}

export function validateFieldName(name: string): boolean {
  if (!name || name.trim() === '') return false
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)
}

export function getSchemaProperties(schema: JSONSchema): Property[] {
  if (!isObjectSchema(schema) || !schema.properties) return []
  const required = schema.required || []
  return Object.entries(schema.properties).map(([name, propSchema]) => ({
    name,
    schema: propSchema,
    required: required.includes(name),
  }))
}

export function getArrayItemsSchema(schema: JSONSchema): JSONSchema | null {
  if (isBooleanSchema(schema)) return null
  if (schema.type !== 'array') return null
  return schema.items || null
}

export function renameObjectProperty(
  schema: ObjectJSONSchema,
  oldName: string,
  newName: string
): ObjectJSONSchema {
  if (!isObjectSchema(schema) || !schema.properties) return schema
  const newSchema = copySchema(schema)
  const newProperties: Record<string, JSONSchema> = {}
  for (const [key, value] of Object.entries(newSchema.properties || {})) {
    newProperties[key === oldName ? newName : key] = value
  }
  newSchema.properties = newProperties
  if (newSchema.required) {
    newSchema.required = newSchema.required.map((field) => (field === oldName ? newName : field))
  }
  return newSchema
}

export function hasChildren(schema: JSONSchema): boolean {
  if (!isObjectSchema(schema)) return false
  if (schema.type === 'object' && schema.properties) {
    return Object.keys(schema.properties).length > 0
  }
  if (schema.type === 'array' && schema.items && isObjectSchema(schema.items)) {
    return schema.items.type === 'object' && !!schema.items.properties
  }
  return false
}
