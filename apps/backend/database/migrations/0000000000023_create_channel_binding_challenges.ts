import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('channel_binding_challenges', (table) => {
      table.increments('id').notNullable()
      table.string('channel', 32).notNullable()
      table.string('external_tenant_id', 191).notNullable()
      table.string('external_user_id', 191).notNullable()
      table.string('code_hash', 64).notNullable().unique()
      table.timestamp('expires_at').notNullable().index()
      table.timestamp('used_at').nullable()
      table.timestamp('created_at').notNullable()
      table.index(['channel', 'external_tenant_id', 'external_user_id', 'used_at'])
    })
  }

  async down() {
    this.schema.dropTable('channel_binding_challenges')
  }
}
