import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'llm_configurations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('chat_reasoning_level', 12).notNullable().defaultTo('medium')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('chat_reasoning_level')
    })
  }
}
