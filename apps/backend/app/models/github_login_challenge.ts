import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class GithubLoginChallenge extends BaseModel {
  static table = 'github_login_challenges'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare githubId: string

  @column()
  declare githubLogin: string

  @column()
  declare githubEmail: string

  @column()
  declare codeHash: string

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare usedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
