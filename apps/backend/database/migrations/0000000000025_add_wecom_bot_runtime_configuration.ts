import encryption from '@adonisjs/core/services/encryption'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      ALTER TABLE llm_configurations
        ADD COLUMN IF NOT EXISTS wecom_bot_id VARCHAR(160) NULL,
        ADD COLUMN IF NOT EXISTS wecom_bot_secret TEXT NULL,
        ADD COLUMN IF NOT EXISTS wecom_bot_tenant_id VARCHAR(160) NULL,
        ADD COLUMN IF NOT EXISTS wecom_bot_ws_url VARCHAR(500) NULL
    `)

    const botId = process.env.WECOM_BOT_ID?.trim()
    const secret = process.env.WECOM_BOT_SECRET?.trim()
    const tenantId = process.env.WECOM_BOT_TENANT_ID?.trim()
    const wsUrl = process.env.WECOM_BOT_WS_URL?.trim()

    if (botId || secret || tenantId || wsUrl) {
      await this.db
        .from('llm_configurations')
        .where('id', 1)
        .update({
          wecom_bot_id: botId || null,
          wecom_bot_secret: secret ? encryption.encrypt(secret) : null,
          wecom_bot_tenant_id: tenantId || null,
          wecom_bot_ws_url: wsUrl || null,
          updated_at: new Date(),
        })
    }
  }

  async down() {
    await this.db.rawQuery(`
      ALTER TABLE llm_configurations
        DROP COLUMN IF EXISTS wecom_bot_id,
        DROP COLUMN IF EXISTS wecom_bot_secret,
        DROP COLUMN IF EXISTS wecom_bot_tenant_id,
        DROP COLUMN IF EXISTS wecom_bot_ws_url
    `)
  }
}
