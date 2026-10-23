import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export type WecomMessageType = 'text' | 'markdown' | 'markdown_v2'

type WecomTemplateParameter = {
  name: string
  type: 'string' | 'number' | 'boolean'
  required: boolean
  description?: string | null
  maxBytes?: number | null
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isWecomTemplateParameter(value: unknown): value is WecomTemplateParameter {
  return (
    isJsonRecord(value) &&
    typeof value.name === 'string' &&
    ['string', 'number', 'boolean'].includes(value.type as string) &&
    typeof value.required === 'boolean' &&
    (value.description === undefined ||
      value.description === null ||
      typeof value.description === 'string') &&
    (value.maxBytes === undefined || value.maxBytes === null || typeof value.maxBytes === 'number')
  )
}

function isWecomTemplateParameterArray(value: unknown): value is WecomTemplateParameter[] {
  return Array.isArray(value) && value.every(isWecomTemplateParameter)
}

function prepareJson(value: unknown, fallback: unknown, isValid: (value: unknown) => boolean) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : (value ?? fallback)
  if (!isValid(parsed)) throw new TypeError('Invalid JSON shape for WeCom message template')
  return JSON.stringify(parsed)
}

function consumeJson<T>(value: unknown, isValid: (value: unknown) => value is T): T {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (!isValid(parsed)) throw new TypeError('Invalid JSON shape in WeCom message template')
  return parsed
}

export default class WecomMessageTemplate extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare description: string | null

  @column()
  declare msgtype: WecomMessageType

  @column({ serializeAs: null })
  declare webhookUrl: string

  @column({
    prepare: (value: Record<string, unknown>) => prepareJson(value, {}, isJsonRecord),
    consume: (value: unknown) => consumeJson(value, isJsonRecord),
  })
  declare payload: Record<string, unknown>

  @column({
    prepare: (value: WecomMessageTemplate['parameters']) =>
      prepareJson(value, [], isWecomTemplateParameterArray),
    consume: (value: unknown) => consumeJson(value, isWecomTemplateParameterArray),
  })
  declare parameters: WecomTemplateParameter[]

  @column()
  declare enabled: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
