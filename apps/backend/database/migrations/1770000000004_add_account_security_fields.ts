import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('two_factor_enabled').notNullable().defaultTo(false)
      table.timestamp('password_changed_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('two_factor_enabled')
      table.dropColumn('password_changed_at')
    })
  }
}
