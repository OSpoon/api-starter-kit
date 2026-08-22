import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      ALTER TABLE llm_configurations
        ADD COLUMN IF NOT EXISTS feishu_app_id VARCHAR(160) NULL,
        ADD COLUMN IF NOT EXISTS feishu_app_secret TEXT NULL,
        ADD COLUMN IF NOT EXISTS feishu_domain VARCHAR(80) NULL
    `)
  }

  async down() {
    await this.db.rawQuery(`
      ALTER TABLE llm_configurations
        DROP COLUMN IF EXISTS feishu_app_id,
        DROP COLUMN IF EXISTS feishu_app_secret,
        DROP COLUMN IF EXISTS feishu_domain
    `)
  }
}
