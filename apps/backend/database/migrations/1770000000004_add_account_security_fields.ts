import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    const hasTwoFactorEnabled = await this.schema.hasColumn(this.tableName, 'two_factor_enabled')
    const hasPasswordChangedAt = await this.schema.hasColumn(this.tableName, 'password_changed_at')

    if (!hasTwoFactorEnabled || !hasPasswordChangedAt) {
      this.schema.alterTable(this.tableName, (table) => {
        if (!hasTwoFactorEnabled) {
          table.boolean('two_factor_enabled').notNullable().defaultTo(false)
        }
        if (!hasPasswordChangedAt) {
          table.timestamp('password_changed_at').nullable()
        }
      })
    }
  }

  async down() {
    const hasTwoFactorEnabled = await this.schema.hasColumn(this.tableName, 'two_factor_enabled')
    const hasPasswordChangedAt = await this.schema.hasColumn(this.tableName, 'password_changed_at')

    if (hasTwoFactorEnabled || hasPasswordChangedAt) {
      this.schema.alterTable(this.tableName, (table) => {
        if (hasTwoFactorEnabled) {
          table.dropColumn('two_factor_enabled')
        }
        if (hasPasswordChangedAt) {
          table.dropColumn('password_changed_at')
        }
      })
    }
  }
}
