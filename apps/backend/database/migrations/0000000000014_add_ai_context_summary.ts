import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ai_chat_conversations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('context_summary').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('context_summary')
    })
  }
}
