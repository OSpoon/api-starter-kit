import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('github_identities', (table) => {
      table.increments('id').notNullable()
      table.integer('user_id').unsigned().notNullable().unique()
      table.bigInteger('github_id').notNullable().unique()
      table.string('github_login', 255).notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.foreign('user_id').references('users.id').onDelete('CASCADE')
    })

    this.schema.createTable('github_login_exchanges', (table) => {
      table.increments('id').notNullable()
      table.integer('user_id').unsigned().notNullable()
      table.string('code_hash', 64).notNullable().unique()
      table.timestamp('expires_at').notNullable().index()
      table.timestamp('used_at').nullable()
      table.timestamp('created_at').notNullable()

      table.foreign('user_id').references('users.id').onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.dropTable('github_login_exchanges')
    this.schema.dropTable('github_identities')
  }
}
