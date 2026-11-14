import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('api_keys', (table) => {
      table.dropColumn('kind')
    })
  }

  async down() {
    this.schema.alterTable('api_keys', (table) => {
      table.string('kind', 24).notNullable().defaultTo('integration')
    })
  }
}
