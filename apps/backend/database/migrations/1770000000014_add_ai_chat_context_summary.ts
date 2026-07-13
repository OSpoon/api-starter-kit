import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ai_chat_conversations', (table) => {
      table.text('context_summary').nullable()
      table.integer('summary_until_message_id').unsigned().nullable()
    })
  }

  async down() {
    this.schema.alterTable('ai_chat_conversations', (table) => {
      table.dropColumn('context_summary')
      table.dropColumn('summary_until_message_id')
    })
  }
}
