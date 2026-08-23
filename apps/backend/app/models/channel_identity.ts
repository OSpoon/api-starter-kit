import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'

import User from '#models/user'

export type ChannelName = 'wecom' | 'feishu' | 'dingtalk'
export type ChannelIdentityStatus = 'active' | 'revoked'

export default class ChannelIdentity extends BaseModel {
  static table = 'channel_identities'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare channel: ChannelName

  @column()
  declare externalTenantId: string

  @column()
  declare externalUserId: string

  @column()
  declare userId: number

  @column()
  declare status: ChannelIdentityStatus

  @column.dateTime()
  declare boundAt: DateTime

  @column.dateTime()
  declare revokedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
