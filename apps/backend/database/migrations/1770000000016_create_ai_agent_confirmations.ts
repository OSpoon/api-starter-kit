import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ai_agent_confirmations', (table) => {
      table.increments('id')
      table
        .integer('conversation_id')
        .unsigned()
        .notNullable()
        .references('ai_chat_conversations.id')
        .onDelete('CASCADE')
      table
        .integer('assistant_message_id')
        .unsigned()
        .nullable()
        .references('ai_chat_messages.id')
        .onDelete('SET NULL')
      table
        .integer('requested_by_user_id')
        .unsigned()
        .notNullable()
        .references('users.id')
        .onDelete('CASCADE')
      table.string('agent_run_id', 80).notNullable()
      table.string('action', 120).notNullable()
      table.jsonb('payload').notNullable()
      table.enum('status', ['pending', 'confirmed', 'expired', 'failed']).notNullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('confirmed_at').nullable()
      table
        .integer('confirmed_by_user_id')
        .unsigned()
        .nullable()
        .references('users.id')
        .onDelete('SET NULL')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['conversation_id', 'assistant_message_id'])
      table.index(['requested_by_user_id', 'status', 'expires_at'])
      table.index(['agent_run_id'])
    })
  }

  async down() {
    this.schema.dropTable('ai_agent_confirmations')
  }
}
