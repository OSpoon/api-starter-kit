import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('failed_login_attempts').notNullable().defaultTo(0)
      table.timestamp('locked_until').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('failed_login_attempts')
      table.dropColumn('locked_until')
    })
  }
}
