import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.schema.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS ai_agent_confirmations_pending_run_scope_unique
      ON ai_agent_confirmations (
        conversation_id,
        requested_by_user_id,
        agent_run_id,
        action,
        target_type,
        target_id
      )
      WHERE status = 'pending'
    `)
  }

  async down() {
    await this.schema.raw('DROP INDEX IF EXISTS ai_agent_confirmations_pending_run_scope_unique')
  }
}
