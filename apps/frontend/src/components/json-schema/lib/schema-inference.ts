import { asObjectSchema, type JSONSchema } from '@/components/json-schema/types/jsonSchema.ts'

function mergeSchemas(schema1: JSONSchema, schema2: JSONSchema): JSONSchema {
  const s1 = asObjectSchema(schema1)
  const s2 = asObjectSchema(schema2)
  if (JSON.stringify(s1) === JSON.stringify(s2)) return schema1
  if (s1.type === 'integer' && s2.type === 'number') return { type: 'number' }
  if (s1.type === 'number' && s2.type === 'integer') return { type: 'number' }
  const existingOneOf = Array.isArray(s1.oneOf) ? s1.oneOf : [s1]
  const newSchemaToAdd = s2
  if (!existingOneOf.some((s) => JSON.stringify(s) === JSON.stringify(newSchemaToAdd))) {
    const mergedOneOf = [...existingOneOf, newSchemaToAdd]
    const uniqueSchemas = [...new Map(mergedOneOf.map((s) => [JSON.stringify(s), s])).values()]
    if (uniqueSchemas.length === 1) return uniqueSchemas[0]!
    return { oneOf: uniqueSchemas }
  }
  return s1.oneOf ? s1 : { oneOf: [s1] }
}

function inferObjectSchema(obj: Record<string, unknown>): JSONSchema {
  const properties: Record<string, JSONSchema> = {}
  const required: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    properties[key] = inferSchema(value)
    if (value !== undefined && value !== null) required.push(key)
  }
  return { type: 'object', properties, required: required.length > 0 ? required.sort() : undefined }
}

function detectEnumsInArrayItems(
  mergedProperties: Record<string, JSONSchema>,
  originalArray: Record<string, unknown>[],
  totalItems: number
): Record<string, JSONSchema> {
  if (totalItems < 10 || Object.keys(mergedProperties).length === 0) return mergedProperties
  const valueMap: Record<string, Set<string | number>> = {}
  for (const item of originalArray) {
    for (const key in mergedProperties) {
      if (Object.prototype.hasOwnProperty.call(item, key)) {
        const value = item[key]
        if (typeof value === 'string' || typeof value === 'number') {
          if (!valueMap[key]) valueMap[key] = new Set()
          valueMap[key].add(value)
        }
      }
    }
  }
  const updatedProperties = { ...mergedProperties }
  for (const key in valueMap) {
    const distinctValues = Array.from(valueMap[key]!)
    if (
      distinctValues.length > 1 &&
      distinctValues.length <= 10 &&
      distinctValues.length < totalItems / 2
    ) {
      const currentSchema = asObjectSchema(updatedProperties[key]!)
      if (
        currentSchema.type === 'string' ||
        currentSchema.type === 'number' ||
        currentSchema.type === 'integer'
      ) {
        updatedProperties[key] = { type: currentSchema.type, enum: distinctValues.sort() }
      }
    }
  }
  return updatedProperties
}

function detectSemanticFormatsInArrayItems(
  mergedProperties: Record<string, JSONSchema>,
  originalArray: Record<string, unknown>[]
): Record<string, JSONSchema> {
  const updatedProperties = { ...mergedProperties }
  for (const key in updatedProperties) {
    const currentSchema = asObjectSchema(updatedProperties[key]!)
    if (/coordinates?|coords?|latLon|lonLat|point/i.test(key) && currentSchema.type === 'array') {
      const itemsSchema = asObjectSchema(currentSchema.items!)
      if (itemsSchema?.type === 'number' || itemsSchema?.type === 'integer') {
        let isValidCoordArray = true
        let coordLength: number | null = null
        for (const item of originalArray) {
          if (Object.prototype.hasOwnProperty.call(item, key) && Array.isArray(item[key])) {
            const arr = item[key] as unknown[]
            if (coordLength === null) coordLength = arr.length
            if (
              arr.length !== coordLength ||
              (arr.length !== 2 && arr.length !== 3) ||
              !arr.every((v) => typeof v === 'number')
            ) {
              isValidCoordArray = false
              break
            }
          } else if (Object.prototype.hasOwnProperty.call(item, key)) {
            isValidCoordArray = false
            break
          }
        }
        if (isValidCoordArray && coordLength !== null) {
          updatedProperties[key] = {
            type: 'array',
            items: { type: 'number' },
            minItems: coordLength,
            maxItems: coordLength,
          }
        }
      }
    }
    if (/timestamp|createdAt|updatedAt|occurredAt/i.test(key) && currentSchema.type === 'integer') {
      let isTimestampLike = true
      const now = Date.now()
      const fiftyYearsAgo = now - 50 * 365 * 24 * 60 * 60 * 1000
      for (const item of originalArray) {
        if (Object.prototype.hasOwnProperty.call(item, key)) {
          const val = item[key]
          if (typeof val !== 'number' || !Number.isInteger(val) || val < fiftyYearsAgo) {
            isTimestampLike = false
            break
          }
        }
      }
      if (isTimestampLike) {
        updatedProperties[key] = {
          type: 'integer',
          format: 'unix-timestamp',
          description: 'Unix timestamp (likely milliseconds)',
        }
      }
    }
  }
  return updatedProperties
}

function processArrayOfObjects(
  itemSchemas: JSONSchema[],
  originalArray: Record<string, unknown>[]
): JSONSchema {
  let mergedProperties: Record<string, JSONSchema> = {}
  const propertyCounts: Record<string, number> = {}
  const totalItems = itemSchemas.length
  for (const schema of itemSchemas) {
    const objSchema = asObjectSchema(schema)
    if (!objSchema.properties) continue
    for (const [key, value] of Object.entries(objSchema.properties)) {
      propertyCounts[key] = (propertyCounts[key] || 0) + 1
      if (key in mergedProperties) {
        mergedProperties[key] = mergeSchemas(mergedProperties[key]!, value)
      } else {
        mergedProperties[key] = value
      }
    }
  }
  const requiredProps = Object.entries(propertyCounts)
    .filter(([_, count]) => count === totalItems)
    .map(([key, _]) => key)
  mergedProperties = detectEnumsInArrayItems(mergedProperties, originalArray, totalItems)
  mergedProperties = detectSemanticFormatsInArrayItems(mergedProperties, originalArray)
  return {
    type: 'object',
    properties: mergedProperties,
    required: requiredProps.length > 0 ? requiredProps.sort() : undefined,
  }
}

function inferArraySchema(obj: unknown[]): JSONSchema {
  if (obj.length === 0) return { type: 'array', items: {} }
  const itemSchemas = obj.map((item) => inferSchema(item))
  const firstItemSchema = asObjectSchema(itemSchemas[0]!)
  const allSameType = itemSchemas.every(
    (schema) => asObjectSchema(schema).type === firstItemSchema.type
  )
  if (allSameType) {
    if (firstItemSchema.type === 'object') {
      const itemsSchema = processArrayOfObjects(itemSchemas, obj as Record<string, unknown>[])
      return { type: 'array', items: itemsSchema, minItems: 0 }
    }
    return { type: 'array', items: itemSchemas[0], minItems: 0 }
  }
  const uniqueSchemas = [...new Map(itemSchemas.map((s) => [JSON.stringify(s), s])).values()]
  if (uniqueSchemas.length === 1 && asObjectSchema(uniqueSchemas[0]!).type === 'object') {
    return { type: 'array', items: uniqueSchemas[0]!, minItems: 0 }
  }
  return {
    type: 'array',
    items: uniqueSchemas.length === 1 ? uniqueSchemas[0]! : { oneOf: uniqueSchemas },
    minItems: 0,
  }
}

function inferStringSchema(str: string): JSONSchema {
  const formats: Record<string, RegExp> = {
    date: /^\d{4}-\d{2}-\d{2}$/,
    'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,
    email: /^[^@]+@[^@]+\.[^@]+$/,
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    uri: /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i,
  }
  for (const [format, regex] of Object.entries(formats)) {
    if (regex.test(str)) return { type: 'string', format }
  }
  return { type: 'string' }
}

function inferNumberSchema(num: number): JSONSchema {
  return Number.isInteger(num) ? { type: 'integer' } : { type: 'number' }
}

export function inferSchema(obj: unknown): JSONSchema {
  if (obj === null) return { type: 'null' }
  const type = Array.isArray(obj) ? 'array' : typeof obj
  switch (type) {
    case 'object':
      return inferObjectSchema(obj as Record<string, unknown>)
    case 'array':
      return inferArraySchema(obj as unknown[])
    case 'string':
      return inferStringSchema(obj as string)
    case 'number':
      return inferNumberSchema(obj as number)
    case 'boolean':
      return { type: 'boolean' }
    default:
      return {}
  }
}

export function createSchemaFromJson(jsonObject: unknown): JSONSchema {
  const inferredSchema = inferSchema(jsonObject)
  const rootSchema = asObjectSchema(inferredSchema)
  const finalSchema: Record<string, unknown> = {
    $schema: 'https://json-schema.org/draft-07/schema',
    title: 'Generated Schema',
    description: 'Generated from JSON data',
  }
  if (rootSchema.type === 'object' || rootSchema.properties) {
    finalSchema.type = 'object'
    finalSchema.properties = rootSchema.properties
    if (rootSchema.required) finalSchema.required = rootSchema.required
  } else if (rootSchema.type === 'array' || rootSchema.items) {
    finalSchema.type = 'array'
    finalSchema.items = rootSchema.items
    if (rootSchema.minItems !== undefined) finalSchema.minItems = rootSchema.minItems
    if (rootSchema.maxItems !== undefined) finalSchema.maxItems = rootSchema.maxItems
  } else if (rootSchema.type) {
    finalSchema.type = 'object'
    finalSchema.properties = { value: rootSchema }
    finalSchema.required = ['value']
    finalSchema.title = 'Generated Schema (Primitive Root)'
    finalSchema.description = 'Input was a primitive value, wrapped in an object.'
  } else {
    finalSchema.type = 'object'
  }
  return finalSchema as JSONSchema
}
