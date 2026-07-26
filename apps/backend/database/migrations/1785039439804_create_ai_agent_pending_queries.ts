import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ai_agent_pending_queries', (table) => {
      table.increments('id')
      table
        .integer('conversation_id')
        .unsigned()
        .notNullable()
        .references('ai_chat_conversations.id')
        .onDelete('CASCADE')
      table
        .integer('requested_by_user_id')
        .unsigned()
        .notNullable()
        .references('users.id')
        .onDelete('CASCADE')
      table.string('template_code', 120).notNullable()
      table.integer('template_version').unsigned().notNullable()
      table.jsonb('params').notNullable()
      table.jsonb('missing_fields').notNullable()
      table
        .enum('status', ['collecting_parameters', 'executed', 'cancelled', 'expired'])
        .notNullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('completed_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['conversation_id', 'requested_by_user_id', 'status', 'expires_at'])
    })
  }

  async down() {
    this.schema.dropTable('ai_agent_pending_queries')
  }
}
