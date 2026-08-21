import { type AccessToken, DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { compose } from '@adonisjs/core/helpers'
import hash from '@adonisjs/core/services/hash'
import { column, manyToMany } from '@adonisjs/lucid/orm'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'

import { UserSchema } from '#database/schema'
import Role from '#models/role'

export default class User extends compose(UserSchema, withAuthFinder(hash)) {
  static accessTokens = DbAccessTokensProvider.forModel(User)
  declare currentAccessToken?: AccessToken
  declare githubLinked?: boolean

  @column()
  declare twoFactorEnabled: boolean

  @column()
  declare failedLoginAttempts: number

  @column.dateTime()
  declare lockedUntil: DateTime | null

  @column({ serializeAs: null })
  declare twoFactorSecret: string | null

  @column({ serializeAs: null })
  declare twoFactorRecoveryCodes: string | null

  @column.dateTime()
  declare passwordChangedAt: DateTime | null

  @column.dateTime()
  declare disabledAt: DateTime | null

  @manyToMany(() => Role, {
    pivotTable: 'user_roles',
    pivotTimestamps: { createdAt: 'created_at', updatedAt: false },
  })
  declare roles: ManyToMany<typeof Role>

  get initials() {
    const [first, last] = this.fullName ? this.fullName.split(' ') : this.email.split('@')
    if (first && last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    }
    return `${first.slice(0, 2)}`.toUpperCase()
  }
}
