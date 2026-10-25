import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ai_agent_configurations', (table) => {
      table.jsonb('tool_modes').notNullable().defaultTo('{}')
    })
  }

  async down() {
    this.schema.alterTable('ai_agent_configurations', (table) => {
      table.dropColumn('tool_modes')
    })
  }
}
