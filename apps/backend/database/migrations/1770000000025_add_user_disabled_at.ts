import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('users', (table) => table.timestamp('disabled_at').nullable().index())
  }

  async down() {
    this.schema.alterTable('users', (table) => table.dropColumn('disabled_at'))
  }
}
