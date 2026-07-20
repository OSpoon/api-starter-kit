import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ai_agent_confirmations', (table) => {
      table.string('execution_token', 80).nullable()
      table.timestamp('execution_started_at').nullable()
      table.index(['status', 'execution_token'])
    })
  }

  async down() {
    this.schema.alterTable('ai_agent_confirmations', (table) => {
      table.dropIndex(['status', 'execution_token'])
      table.dropColumn('execution_started_at')
      table.dropColumn('execution_token')
    })
  }
}
