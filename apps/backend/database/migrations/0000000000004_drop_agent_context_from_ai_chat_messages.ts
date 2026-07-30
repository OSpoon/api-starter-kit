import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ai_chat_messages', (table) => {
      table.dropColumn('agent_context')
    })
  }

  async down() {
    this.schema.alterTable('ai_chat_messages', (table) => {
      table.jsonb('agent_context').notNullable().defaultTo('[]')
    })
  }
}
