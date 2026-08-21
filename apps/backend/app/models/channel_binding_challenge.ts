import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

import type { ChannelName } from '#models/channel_identity'

export default class ChannelBindingChallenge extends BaseModel {
  static table = 'channel_binding_challenges'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare channel: ChannelName

  @column()
  declare externalTenantId: string

  @column()
  declare externalUserId: string

  @column({ serializeAs: null })
  declare codeHash: string

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare usedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
