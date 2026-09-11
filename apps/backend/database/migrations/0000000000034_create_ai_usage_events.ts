import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ai_usage_events', (table) => {
      table.increments('id').notNullable()
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table
        .integer('conversation_id')
        .unsigned()
        .notNullable()
        .references('ai_chat_conversations.id')
        .onDelete('CASCADE')
      table.string('agent_run_id', 80).notNullable()
      table.integer('call_sequence').unsigned().notNullable()
      table.string('provider_id', 120).notNullable()
      table.string('model_id', 255).notNullable()
      table.integer('input_tokens').notNullable().defaultTo(0)
      table.integer('output_tokens').notNullable().defaultTo(0)
      table.integer('cache_read_tokens').notNullable().defaultTo(0)
      table.integer('cache_write_tokens').notNullable().defaultTo(0)
      table.integer('total_tokens').notNullable().defaultTo(0)
      table.decimal('estimated_cost_usd', 20, 12).nullable()
      table.string('pricing_source', 40).notNullable()
      table.string('pricing_version', 80).nullable()
      table.enum('status', ['completed', 'failed']).notNullable()
      table.timestamp('created_at').notNullable()
      table.unique(['agent_run_id', 'call_sequence'])
      table.index(['user_id', 'created_at'])
      table.index(['conversation_id', 'created_at'])
      table.index(['model_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable('ai_usage_events')
  }
}
