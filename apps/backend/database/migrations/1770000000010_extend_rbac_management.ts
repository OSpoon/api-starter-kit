import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('permissions', (table) => {
      table.boolean('is_system').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable('permissions', (table) => table.dropColumn('is_system'))
  }
}
