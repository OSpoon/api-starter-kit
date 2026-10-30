import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ai_chat_conversations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('context_summary_message_id').unsigned().nullable()
      table
        .foreign('context_summary_message_id')
        .references('ai_chat_messages.id')
        .onDelete('SET NULL')
    })
    this.schema.alterTable('ai_chat_messages', (table) => {
      table.index(['conversation_id', 'id'])
    })
  }

  async down() {
    this.schema.alterTable('ai_chat_messages', (table) => {
      table.dropIndex(['conversation_id', 'id'])
    })
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['context_summary_message_id'])
      table.dropColumn('context_summary_message_id')
    })
  }
}
