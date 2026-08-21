import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'

import AiChatConversation from '#models/ai_chat_conversation'
import type { ChannelName } from '#models/channel_identity'
import User from '#models/user'

export default class ChannelConversation extends BaseModel {
  static table = 'channel_conversations'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare channel: ChannelName

  @column()
  declare externalTenantId: string

  @column()
  declare externalConversationKey: string

  @column()
  declare userId: number

  @column()
  declare conversationId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => AiChatConversation)
  declare conversation: BelongsTo<typeof AiChatConversation>
}
