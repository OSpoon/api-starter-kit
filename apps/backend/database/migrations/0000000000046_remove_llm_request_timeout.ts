import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('llm_configurations', (table) => table.dropColumn('request_timeout_ms'))
  }

  async down() {
    this.schema.alterTable('llm_configurations', (table) => {
      table.integer('request_timeout_ms').notNullable().defaultTo(180000)
    })
  }
}
