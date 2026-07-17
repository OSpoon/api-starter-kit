import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    const hasColumn = await this.schema.hasColumn('api_keys', 'user_id')
    if (!hasColumn) return

    this.schema.alterTable('api_keys', (table) => {
      table.dropIndex(['user_id'])
      table.dropColumn('user_id')
    })
  }

  async down() {
    const hasColumn = await this.schema.hasColumn('api_keys', 'user_id')
    if (hasColumn) return

    this.schema.alterTable('api_keys', (table) => {
      table.integer('user_id').unsigned().references('users.id').onDelete('CASCADE').nullable()
      table.index(['user_id'])
    })
  }
}
