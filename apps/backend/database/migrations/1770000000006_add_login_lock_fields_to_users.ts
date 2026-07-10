import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    const hasFailedLoginAttempts = await this.schema.hasColumn(
      this.tableName,
      'failed_login_attempts'
    )
    const hasLockedUntil = await this.schema.hasColumn(this.tableName, 'locked_until')

    if (!hasFailedLoginAttempts || !hasLockedUntil) {
      this.schema.alterTable(this.tableName, (table) => {
        if (!hasFailedLoginAttempts) {
          table.integer('failed_login_attempts').notNullable().defaultTo(0)
        }
        if (!hasLockedUntil) {
          table.timestamp('locked_until').nullable()
        }
      })
    }
  }

  async down() {
    const hasFailedLoginAttempts = await this.schema.hasColumn(
      this.tableName,
      'failed_login_attempts'
    )
    const hasLockedUntil = await this.schema.hasColumn(this.tableName, 'locked_until')

    if (hasFailedLoginAttempts || hasLockedUntil) {
      this.schema.alterTable(this.tableName, (table) => {
        if (hasFailedLoginAttempts) {
          table.dropColumn('failed_login_attempts')
        }
        if (hasLockedUntil) {
          table.dropColumn('locked_until')
        }
      })
    }
  }
}
