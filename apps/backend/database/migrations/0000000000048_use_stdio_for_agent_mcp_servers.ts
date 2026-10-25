import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      ALTER TABLE ai_agent_mcp_servers
        ADD COLUMN IF NOT EXISTS command varchar(2000) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS args jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS cwd varchar(2000),
        ADD COLUMN IF NOT EXISTS environment text
    `)
    await this.db.rawQuery(`
      UPDATE ai_agent_mcp_servers
      SET command = COALESCE(command, ''), args = COALESCE(args, '[]'::jsonb), enabled = false
    `)
    await this.db.rawQuery(`
      ALTER TABLE ai_agent_mcp_servers
        ALTER COLUMN command SET DEFAULT '',
        ALTER COLUMN command SET NOT NULL,
        ALTER COLUMN args SET DEFAULT '[]'::jsonb,
        ALTER COLUMN args SET NOT NULL,
        DROP COLUMN IF EXISTS url,
        DROP COLUMN IF EXISTS bearer_token
    `)
  }

  async down() {
    await this.db.rawQuery('UPDATE ai_agent_mcp_servers SET enabled = false')
    await this.db.rawQuery(`
      ALTER TABLE ai_agent_mcp_servers
        ADD COLUMN IF NOT EXISTS url varchar(2000),
        ADD COLUMN IF NOT EXISTS bearer_token text,
        DROP COLUMN IF EXISTS command,
        DROP COLUMN IF EXISTS args,
        DROP COLUMN IF EXISTS cwd,
        DROP COLUMN IF EXISTS environment
    `)
  }
}
