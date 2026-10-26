import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ai_agent_configurations', (table) => {
      table.jsonb('mcp_servers').notNullable().defaultTo('{}')
    })
    this.schema.dropTable('ai_agent_mcp_servers')
  }

  async down() {
    this.schema.createTable('ai_agent_mcp_servers', (table) => {
      table.bigIncrements('id')
      table.string('name', 128).notNullable()
      table.string('command', 2000).notNullable().defaultTo('')
      table.jsonb('args').notNullable().defaultTo('[]')
      table.string('cwd', 2000).nullable()
      table.text('environment').nullable()
      table.boolean('enabled').notNullable().defaultTo(false)
      table.jsonb('enabled_tools').notNullable().defaultTo('{}')
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
    this.schema.alterTable('ai_agent_configurations', (table) => {
      table.dropColumn('mcp_servers')
    })
  }
}
