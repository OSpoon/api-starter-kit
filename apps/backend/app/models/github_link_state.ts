import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class GithubLinkState extends BaseModel {
  static table = 'github_link_states'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare stateHash: string

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare usedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
