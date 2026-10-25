import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(
      'ALTER TABLE ai_agent_confirmations DROP CONSTRAINT ai_agent_confirmations_status_check'
    )
    await this.db.rawQuery(
      "ALTER TABLE ai_agent_confirmations ADD CONSTRAINT ai_agent_confirmations_status_check CHECK (status IN ('pending', 'confirmed', 'expired', 'failed', 'cancelled'))"
    )
  }

  async down() {
    await this.db.rawQuery(
      "UPDATE ai_agent_confirmations SET status = 'failed' WHERE status = 'cancelled'"
    )
    await this.db.rawQuery(
      'ALTER TABLE ai_agent_confirmations DROP CONSTRAINT ai_agent_confirmations_status_check'
    )
    await this.db.rawQuery(
      "ALTER TABLE ai_agent_confirmations ADD CONSTRAINT ai_agent_confirmations_status_check CHECK (status IN ('pending', 'confirmed', 'expired', 'failed'))"
    )
  }
}
