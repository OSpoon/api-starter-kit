import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('api_keys', (table) => {
      table.integer('user_id').unsigned().references('users.id').onDelete('CASCADE').nullable()
      table.index(['user_id'])
    })
  }

  async down() {
    this.schema.alterTable('api_keys', (table) => {
      table.dropIndex(['user_id'])
      table.dropColumn('user_id')
    })
  }
}
