import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ai_agent_confirmations', (table) => {
      table.string('target_type', 80).nullable()
      table.string('target_id', 120).nullable()
      table.jsonb('target_summary').nullable()
      table.index(['target_type', 'target_id'])
    })
  }

  async down() {
    this.schema.alterTable('ai_agent_confirmations', (table) => {
      table.dropIndex(['target_type', 'target_id'])
      table.dropColumn('target_summary')
      table.dropColumn('target_id')
      table.dropColumn('target_type')
    })
  }
}
