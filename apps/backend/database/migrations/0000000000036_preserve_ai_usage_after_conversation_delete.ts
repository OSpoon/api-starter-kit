import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ai_usage_events', (table) => {
      table.dropForeign(['conversation_id'])
      table.integer('conversation_id').unsigned().nullable().alter()
      table.foreign('conversation_id').references('ai_chat_conversations.id').onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable('ai_usage_events', (table) => {
      table.dropForeign(['conversation_id'])
      table.integer('conversation_id').unsigned().notNullable().alter()
      table.foreign('conversation_id').references('ai_chat_conversations.id').onDelete('CASCADE')
    })
  }
}
