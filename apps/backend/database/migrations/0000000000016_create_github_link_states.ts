import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('github_link_states', (table) => {
      table.increments('id').notNullable()
      table.integer('user_id').unsigned().notNullable()
      table.string('state_hash', 64).notNullable().unique()
      table.timestamp('expires_at').notNullable().index()
      table.timestamp('used_at').nullable()
      table.timestamp('created_at').notNullable()
      table.foreign('user_id').references('users.id').onDelete('CASCADE')
    })
  }

  async down() {
    this.schema.dropTableIfExists('github_link_states')
  }
}
