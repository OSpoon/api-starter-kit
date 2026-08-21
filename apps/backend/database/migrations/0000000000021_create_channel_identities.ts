import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('channel_identities', (table) => {
      table.increments('id').notNullable()
      table.string('channel', 32).notNullable()
      table.string('external_tenant_id', 191).notNullable()
      table.string('external_user_id', 191).notNullable()
      table.integer('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE')
      table.enum('status', ['active', 'revoked']).notNullable().defaultTo('active')
      table.timestamp('bound_at').notNullable()
      table.timestamp('revoked_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.unique(['channel', 'external_tenant_id', 'external_user_id'])
      table.index(['user_id', 'status'])
      table.index(['channel', 'external_tenant_id', 'status'])
    })
  }

  async down() {
    this.schema.dropTable('channel_identities')
  }
}
