import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export type AiUsageEventStatus = 'completed' | 'failed'

export default class AiUsageEvent extends BaseModel {
  static table = 'ai_usage_events'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare conversationId: number | null

  @column()
  declare agentRunId: string

  @column()
  declare callSequence: number

  @column()
  declare providerId: string

  @column()
  declare modelId: string

  @column()
  declare inputTokens: number

  @column()
  declare outputTokens: number

  @column()
  declare cacheReadTokens: number

  @column()
  declare cacheWriteTokens: number

  @column()
  declare totalTokens: number

  @column()
  declare estimatedCostUsd: string | null

  @column()
  declare pricingSource: 'models.dev' | 'unavailable'

  @column()
  declare pricingVersion: string | null

  @column()
  declare status: AiUsageEventStatus

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
