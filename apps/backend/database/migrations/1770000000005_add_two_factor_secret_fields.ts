import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    const hasTwoFactorSecret = await this.schema.hasColumn(this.tableName, 'two_factor_secret')
    const hasRecoveryCodes = await this.schema.hasColumn(this.tableName, 'two_factor_recovery_codes')

    if (!hasTwoFactorSecret || !hasRecoveryCodes) {
      this.schema.alterTable(this.tableName, (table) => {
        if (!hasTwoFactorSecret) {
          table.text('two_factor_secret').nullable()
        }
        if (!hasRecoveryCodes) {
          table.text('two_factor_recovery_codes').nullable()
        }
      })
    }
  }

  async down() {
    const hasTwoFactorSecret = await this.schema.hasColumn(this.tableName, 'two_factor_secret')
    const hasRecoveryCodes = await this.schema.hasColumn(this.tableName, 'two_factor_recovery_codes')

    if (hasTwoFactorSecret || hasRecoveryCodes) {
      this.schema.alterTable(this.tableName, (table) => {
        if (hasTwoFactorSecret) {
          table.dropColumn('two_factor_secret')
        }
        if (hasRecoveryCodes) {
          table.dropColumn('two_factor_recovery_codes')
        }
      })
    }
  }
}
