import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ai_chat_messages'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('runtime_details').notNullable().defaultTo('[]')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('runtime_details')
    })
  }
}
