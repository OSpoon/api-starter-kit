import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export type AiAgentPendingQueryStatus =
  | 'collecting_parameters'
  | 'executed'
  | 'cancelled'
  | 'expired'

function consumeJsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function consumeStringArray(value: unknown): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : []
  } catch {
    return []
  }
}

export default class AiAgentPendingQuery extends BaseModel {
  static table = 'ai_agent_pending_queries'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare conversationId: number

  @column()
  declare requestedByUserId: number

  @column()
  declare templateCode: string

  @column()
  declare templateVersion: number

  @column({
    prepare: (value: Record<string, unknown>) => JSON.stringify(value ?? {}),
    consume: consumeJsonRecord,
  })
  declare params: Record<string, unknown>

  @column({
    prepare: (value: string[]) => JSON.stringify(value ?? []),
    consume: consumeStringArray,
  })
  declare missingFields: string[]

  @column()
  declare status: AiAgentPendingQueryStatus

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare completedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
