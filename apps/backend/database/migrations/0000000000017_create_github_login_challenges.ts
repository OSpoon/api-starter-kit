import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('github_login_challenges', (table) => {
      table.increments('id').notNullable()
      table.bigInteger('github_id').notNullable()
      table.string('github_login', 255).notNullable()
      table.string('github_email', 254).notNullable()
      table.string('code_hash', 64).notNullable().unique()
      table.timestamp('expires_at').notNullable().index()
      table.timestamp('used_at').nullable()
      table.timestamp('created_at').notNullable()
      table.index(['github_id'])
    })
  }

  async down() {
    this.schema.dropTableIfExists('github_login_challenges')
  }
}
