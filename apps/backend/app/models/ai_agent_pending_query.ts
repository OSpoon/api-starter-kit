import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export type AiAgentPendingQueryStatus =
  | 'collecting_parameters'
  | 'executed'
  | 'cancelled'
  | 'expired'

function consumeJsonRecord(value: unknown): Record<string, unknown> {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }
  throw new TypeError('Invalid JSON object in ai_agent_pending_queries.params')
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
