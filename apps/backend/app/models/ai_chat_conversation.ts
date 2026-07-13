import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'

import AiChatMessage from '#models/ai_chat_message'

export default class AiChatConversation extends BaseModel {
  static table = 'ai_chat_conversations'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare title: string

  @column()
  declare contextSummary: string | null

  @column()
  declare summaryUntilMessageId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => AiChatMessage, {
    foreignKey: 'conversationId',
  })
  declare messages: HasMany<typeof AiChatMessage>
}
