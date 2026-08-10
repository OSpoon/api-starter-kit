import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export type WecomMessageType = 'text' | 'markdown' | 'markdown_v2'

function prepareJson(value: unknown, fallback: unknown) {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value))
    } catch {
      return value
    }
  }
  return JSON.stringify(value ?? fallback)
}

function consumeJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value ?? fallback) as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
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
    prepare: (value: Record<string, unknown>) => prepareJson(value, {}),
    consume: (value: unknown) => consumeJson<Record<string, unknown>>(value, {}),
  })
  declare payload: Record<string, unknown>

  @column({
    prepare: (value: WecomMessageTemplate['parameters']) => prepareJson(value, []),
    consume: (value: unknown) => consumeJson<WecomMessageTemplate['parameters']>(value, []),
  })
  declare parameters: Array<{
    name: string
    type: 'string' | 'number' | 'boolean'
    required: boolean
    description?: string | null
    maxBytes?: number | null
  }>

  @column()
  declare enabled: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
