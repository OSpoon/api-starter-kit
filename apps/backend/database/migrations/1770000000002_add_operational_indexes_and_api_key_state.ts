import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('api_keys', (table) => {
      table.increments('id')

      table.string('name').notNullable()
      table.string('prefix', 16).notNullable()
      table.string('key_hash').notNullable()
      table.text('key_encrypted').nullable()

      table.timestamp('last_used_at').nullable()
      table.timestamp('expires_at').nullable()
      table.timestamp('revoked_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['revoked_at'])
      table.index(['expires_at'])
    })
  }

  async down() {
    this.schema.dropTable('api_keys')
  }
}
