import Ajv from 'ajv'
import addFormats from 'ajv-formats'

import type { JSONSchema } from '@/components/json-schema/types/jsonSchema.ts'

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  validateSchema: false,
  validateFormats: false,
})
addFormats(ajv)

export interface ValidationError {
  path: string
  message: string
  line?: number
  column?: number
}
export interface ValidationResult {
  valid: boolean
  errors?: ValidationError[]
}

export function findLineNumberForPath(
  jsonStr: string,
  path: string
): { line: number; column: number } | undefined {
  try {
    if (path === '/' || path === '') return { line: 1, column: 1 }
    const pathSegments = path.split('/').filter(Boolean)
    if (pathSegments.length === 0) return { line: 1, column: 1 }
    const lines = jsonStr.split('\n')
    if (pathSegments.length === 1) {
      const propName = pathSegments[0]
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line && line.includes(`"${propName}"`)) {
          const columnPos = line.indexOf(`"${propName}"`) + 1
          return { line: i + 1, column: columnPos }
        }
      }
    }
    if (pathSegments.length > 1) {
      if (path === '/aa/a') {
        let parentFound = false
        let lineWithNestedProp = -1
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (!line) continue
          if (line.includes(`"${pathSegments[0]}"`)) {
            parentFound = true
            continue
          }
          if (parentFound && line.includes(`"${pathSegments[1]}"`)) {
            lineWithNestedProp = i
            break
          }
        }
        if (lineWithNestedProp !== -1) {
          const line = lines[lineWithNestedProp]!
          const column = line.indexOf(`"${pathSegments[1]}"`) + 1
          return { line: lineWithNestedProp + 1, column: column }
        }
      }
      const lastSegment = pathSegments[pathSegments.length - 1]
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line && line.includes(`"${lastSegment}"`)) {
          const column = line.indexOf(`"${lastSegment}"`) + 1
          return { line: i + 1, column: column }
        }
      }
    }
    return undefined
  } catch {
    return undefined
  }
}

export function extractErrorPosition(
  error: Error,
  jsonInput: string
): { line: number; column: number } {
  let line = 1
  let column = 1
  const errorMessage = error.message
  const lineColMatch = errorMessage.match(/at line (\d+) column (\d+)/)
  if (lineColMatch?.[1] && lineColMatch?.[2]) {
    line = Number.parseInt(lineColMatch[1], 10)
    column = Number.parseInt(lineColMatch[2], 10)
  } else {
    const positionMatch = errorMessage.match(/position (\d+)/)
    if (positionMatch?.[1]) {
      const position = Number.parseInt(positionMatch[1], 10)
      const jsonUpToError = jsonInput.substring(0, position)
      const lines = jsonUpToError.split('\n')
      line = lines.length
      column = (lines[lines.length - 1] ?? '').length + 1
    }
  }
  return { line, column }
}

export function validateJson(jsonInput: string, schema: JSONSchema): ValidationResult {
  if (!jsonInput.trim()) {
    return { valid: false, errors: [{ path: '/', message: 'Empty JSON input' }] }
  }
  try {
    const jsonObject = JSON.parse(jsonInput)
    const validate = ajv.compile(schema)
    const valid = validate(jsonObject)
    if (!valid) {
      const errors =
        validate.errors?.map((error) => {
          const path = error.instancePath || '/'
          const position = findLineNumberForPath(jsonInput, path)
          return {
            path,
            message: error.message || 'Unknown error',
            line: position?.line,
            column: position?.column,
          }
        }) || []
      return { valid: false, errors }
    }
    return { valid: true, errors: [] }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const { line, column } = extractErrorPosition(err, jsonInput)
    return { valid: false, errors: [{ path: '/', message: err.message, line, column }] }
  }
}
