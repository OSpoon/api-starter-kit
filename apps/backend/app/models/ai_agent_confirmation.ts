import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export type AiAgentConfirmationStatus = 'pending' | 'confirmed' | 'expired' | 'failed'

export default class AiAgentConfirmation extends BaseModel {
  static table = 'ai_agent_confirmations'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare conversationId: number

  @column()
  declare assistantMessageId: number | null

  @column()
  declare requestedByUserId: number

  @column()
  declare agentRunId: string

  @column()
  declare action: string

  @column()
  declare targetType: string | null

  @column()
  declare targetId: string | null

  @column()
  declare targetSummary: Record<string, unknown> | null

  @column()
  declare payload: Record<string, unknown>

  @column()
  declare status: AiAgentConfirmationStatus

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare confirmedAt: DateTime | null

  @column()
  declare confirmedByUserId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
