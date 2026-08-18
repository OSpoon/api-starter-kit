import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Pi Agent reconstructs resumable state from persisted conversation messages.
 * The old LangGraph checkpoint schema is no longer read or written.
 */
export default class extends BaseSchema {
  protected tableName = 'remove_legacy_ai_agent_checkpoint_schema'

  async up() {
    this.schema.raw('DROP SCHEMA IF EXISTS ai_agent CASCADE')
  }

  async down() {
    // Legacy checkpoint data is intentionally not recreated by rollback.
  }
}
