import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

import type { SchemaType } from '@/components/json-schema/types/jsonSchema.ts'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getTypeColor = (type: SchemaType): string => {
  switch (type) {
    case 'string':
      return 'text-blue-500 bg-blue-500/10'
    case 'number':
    case 'integer':
      return 'text-purple-500 bg-purple-500/10'
    case 'boolean':
      return 'text-green-500 bg-green-500/10'
    case 'object':
      return 'text-orange-500 bg-orange-500/10'
    case 'array':
      return 'text-pink-500 bg-pink-500/10'
    case 'null':
      return 'text-gray-500 bg-gray-500/10'
  }
}

export const getTypeLabel = (type: SchemaType): string => {
  switch (type) {
    case 'string':
      return 'Text'
    case 'number':
    case 'integer':
      return 'Number'
    case 'boolean':
      return 'Yes/No'
    case 'object':
      return 'Object'
    case 'array':
      return 'List'
    case 'null':
      return 'Empty'
  }
}
