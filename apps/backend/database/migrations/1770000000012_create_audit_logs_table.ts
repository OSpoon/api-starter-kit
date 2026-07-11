import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('audit_logs', (table) => {
      table.increments('id')
      table
        .integer('actor_user_id')
        .unsigned()
        .nullable()
        .references('users.id')
        .onDelete('SET NULL')
      table.string('action', 120).notNullable()
      table.string('target_type', 80).notNullable()
      table.string('target_id', 120).nullable()
      table.jsonb('metadata').nullable()
      table.string('ip_address', 64).nullable()
      table.string('user_agent', 512).nullable()
      table.string('request_id', 120).nullable()
      table.timestamp('created_at').notNullable()

      table.index(['created_at'])
      table.index(['actor_user_id', 'created_at'])
      table.index(['target_type', 'target_id'])
    })
  }

  async down() {
    this.schema.dropTable('audit_logs')
  }
}
