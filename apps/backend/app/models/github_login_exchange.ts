import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class GithubLoginExchange extends BaseModel {
  static table = 'github_login_exchanges'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare codeHash: string

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare usedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
