import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ai_agent_pending_queries'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('missing_fields')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('missing_fields').notNullable().defaultTo('[]')
    })
  }
}
