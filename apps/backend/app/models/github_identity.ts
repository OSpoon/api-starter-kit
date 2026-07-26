import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class GithubIdentity extends BaseModel {
  static table = 'github_identities'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare githubId: string

  @column()
  declare githubLogin: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
