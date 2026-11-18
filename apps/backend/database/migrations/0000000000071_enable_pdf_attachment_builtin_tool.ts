import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      UPDATE ai_agent_configurations
      SET enabled_tools = enabled_tools || '["read_pdf_attachment"]'::jsonb
      WHERE jsonb_typeof(enabled_tools) = 'array'
        AND enabled_tools <> '[]'::jsonb
        AND NOT (enabled_tools @> '["read_pdf_attachment"]'::jsonb)
    `)
  }

  async down() {
    this.schema.raw(`
      UPDATE ai_agent_configurations
      SET enabled_tools = enabled_tools - 'read_pdf_attachment',
          tool_modes = tool_modes - 'read_pdf_attachment'
    `)
  }
}
