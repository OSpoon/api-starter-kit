import encryption from '@adonisjs/core/services/encryption'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      ALTER TABLE llm_configurations
        ADD COLUMN IF NOT EXISTS asr_api_key TEXT NULL,
        ADD COLUMN IF NOT EXISTS asr_base_url VARCHAR(500) NULL,
        ADD COLUMN IF NOT EXISTS asr_model VARCHAR(160) NOT NULL DEFAULT 'Qwen3-ASR-0.6B-4bit'
    `)

    await this.db
      .from('llm_configurations')
      .where('id', 1)
      .update({
        asr_api_key: process.env.ASR_API_KEY ? encryption.encrypt(process.env.ASR_API_KEY) : null,
        asr_base_url: process.env.ASR_BASE_URL ?? null,
        asr_model: process.env.ASR_MODEL || 'Qwen3-ASR-0.6B-4bit',
      })
  }

  async down() {
    await this.db.rawQuery(`
      ALTER TABLE llm_configurations
        DROP COLUMN IF EXISTS asr_api_key,
        DROP COLUMN IF EXISTS asr_base_url,
        DROP COLUMN IF EXISTS asr_model
    `)
  }
}
