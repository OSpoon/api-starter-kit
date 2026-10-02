import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('llm_configurations', (table) => {
      table.integer('chat_context_window').notNullable().defaultTo(128000)
      table.integer('chat_max_tokens').notNullable().defaultTo(16384)
    })
  }

  async down() {
    this.schema.alterTable('llm_configurations', (table) => {
      table.dropColumn('chat_context_window')
      table.dropColumn('chat_max_tokens')
    })
  }
}
