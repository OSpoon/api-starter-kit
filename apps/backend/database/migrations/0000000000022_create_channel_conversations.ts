import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('channel_conversations', (table) => {
      table.increments('id').notNullable()
      table.string('channel', 32).notNullable()
      table.string('external_tenant_id', 191).notNullable()
      table.string('external_conversation_key', 191).notNullable()
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table
        .integer('conversation_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('ai_chat_conversations.id')
        .onDelete('CASCADE')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.unique(['channel', 'external_tenant_id', 'external_conversation_key'])
      table.index(['user_id', 'channel'])
    })
  }

  async down() {
    this.schema.dropTable('channel_conversations')
  }
}
