import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ai_automations', (table) => {
      table.string('webhook_type', 16).notNullable().defaultTo('generic')
    })
  }

  async down() {
    this.schema.alterTable('ai_automations', (table) => {
      table.dropColumn('webhook_type')
    })
  }
}
