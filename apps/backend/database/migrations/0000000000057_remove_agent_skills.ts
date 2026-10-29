import { BaseSchema } from '@adonisjs/lucid/schema'

const removedTools = ['list_agent_skills', 'load_agent_skill']

export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(
      `UPDATE ai_agent_configurations
       SET enabled_tools = COALESCE(
         (
           SELECT jsonb_agg(items.tool)
           FROM jsonb_array_elements_text(ai_agent_configurations.enabled_tools) AS items(tool)
           WHERE items.tool NOT IN (?, ?)
         ),
         '[]'::jsonb
       ),
       tool_modes = COALESCE(tool_modes, '{}'::jsonb) - ? - ?
       WHERE enabled_tools \\?| ARRAY[?, ?]
          OR COALESCE(tool_modes, '{}'::jsonb) \\?| ARRAY[?, ?]`,
      [...removedTools, ...removedTools, ...removedTools, ...removedTools]
    )

    this.schema.dropTable('ai_agent_skills')
  }

  async down() {
    // shortcut: rollback recreates an empty table because removed skill content is not retained; add a backup migration if restoration is required.
    this.schema.createTable('ai_agent_skills', (table) => {
      table.bigIncrements('id')
      table.string('code', 64).notNullable().unique()
      table.string('name', 128).notNullable()
      table.string('description', 1024).notNullable()
      table.text('instructions').notNullable()
      table.boolean('enabled').notNullable().defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }
}
