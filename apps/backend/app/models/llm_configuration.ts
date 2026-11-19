import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

import type { AiAgentThinkingLevel } from '#ai/core/ai_agent_config'

export default class LlmConfiguration extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column({ serializeAs: null })
  declare chatApiKey: string | null

  @column()
  declare chatBaseUrl: string | null

  @column()
  declare chatModel: string

  @column()
  declare chatContextWindow: number

  @column()
  declare chatMaxTokens: number

  @column()
  declare chatReasoningLevel: AiAgentThinkingLevel

  @column({ serializeAs: null })
  declare asrApiKey: string | null

  @column()
  declare asrBaseUrl: string | null

  @column()
  declare asrModel: string

  @column({ serializeAs: null })
  declare embeddingApiKey: string | null

  @column()
  declare embeddingBaseUrl: string | null

  @column()
  declare embeddingModel: string | null

  @column()
  declare embeddingDimensions: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
