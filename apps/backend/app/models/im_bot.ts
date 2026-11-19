import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

import type { ChannelName } from '#models/channel_identity'

export default class ImBot extends BaseModel {
  static table = 'im_bots'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare channel: ChannelName

  @column()
  declare identifier: string | null

  @column({ serializeAs: null })
  declare secret: string | null

  @column()
  declare tenantId: string | null

  @column()
  declare endpoint: string | null

  @column()
  declare cardTemplateId: string | null

  @column()
  declare streamingCardTemplateId: string | null

  @column()
  declare enabled: boolean

  @column()
  declare legacyIdentity: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
