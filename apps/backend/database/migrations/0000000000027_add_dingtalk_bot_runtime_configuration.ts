import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      ALTER TABLE llm_configurations
        ADD COLUMN IF NOT EXISTS dingtalk_client_id VARCHAR(160) NULL,
        ADD COLUMN IF NOT EXISTS dingtalk_client_secret TEXT NULL,
        ADD COLUMN IF NOT EXISTS dingtalk_card_template_id VARCHAR(200) NULL
    `)
  }

  async down() {
    await this.db.rawQuery(`
      ALTER TABLE llm_configurations
        DROP COLUMN IF EXISTS dingtalk_client_id,
        DROP COLUMN IF EXISTS dingtalk_client_secret,
        DROP COLUMN IF EXISTS dingtalk_card_template_id
    `)
  }
}
