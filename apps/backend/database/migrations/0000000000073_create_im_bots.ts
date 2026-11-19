import { BaseSchema } from '@adonisjs/lucid/schema'

const legacyColumns = [
  'wecom_bot_id',
  'wecom_bot_secret',
  'wecom_bot_tenant_id',
  'wecom_bot_ws_url',
  'feishu_app_id',
  'feishu_app_secret',
  'feishu_domain',
  'dingtalk_client_id',
  'dingtalk_client_secret',
  'dingtalk_card_template_id',
  'dingtalk_streaming_card_template_id',
]

export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      CREATE TABLE im_bots (
        id SERIAL PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        channel VARCHAR(32) NOT NULL CHECK (channel IN ('wecom', 'feishu', 'dingtalk')),
        identifier VARCHAR(160) NULL,
        secret TEXT NULL,
        tenant_id VARCHAR(160) NULL,
        endpoint VARCHAR(500) NULL,
        card_template_id VARCHAR(200) NULL,
        streaming_card_template_id VARCHAR(200) NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        legacy_identity BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE (channel, identifier)
      )
    `)
    await this.db.rawQuery(
      'CREATE INDEX im_bots_channel_enabled_index ON im_bots (channel, enabled)'
    )
    await this.db.rawQuery(
      'CREATE UNIQUE INDEX im_bots_legacy_channel_unique ON im_bots (channel) WHERE legacy_identity = TRUE'
    )

    const { rows } = await this.db.rawQuery(
      `SELECT COUNT(*)::int AS count FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'llm_configurations'
       AND column_name = ANY(?)`,
      [legacyColumns]
    )
    const columnCount = Number(rows[0]?.count ?? 0)
    if (columnCount !== 0 && columnCount !== legacyColumns.length) {
      throw new Error(
        'Cannot migrate IM bot settings because legacy configuration columns are incomplete'
      )
    }

    if (columnCount === legacyColumns.length) {
      await this.db.rawQuery(`
        INSERT INTO im_bots
          (name, channel, identifier, secret, tenant_id, endpoint, card_template_id,
           streaming_card_template_id, enabled, legacy_identity, created_at, updated_at)
        SELECT '企业微信机器人', 'wecom', wecom_bot_id, wecom_bot_secret, wecom_bot_tenant_id,
          wecom_bot_ws_url, NULL, NULL,
          wecom_bot_id IS NOT NULL AND wecom_bot_secret IS NOT NULL AND wecom_bot_tenant_id IS NOT NULL,
          TRUE, NOW(), NOW()
        FROM llm_configurations
        WHERE id = 1 AND (wecom_bot_id IS NOT NULL OR wecom_bot_secret IS NOT NULL
          OR wecom_bot_tenant_id IS NOT NULL OR wecom_bot_ws_url IS NOT NULL)
      `)
      await this.db.rawQuery(`
        INSERT INTO im_bots
          (name, channel, identifier, secret, tenant_id, endpoint, card_template_id,
           streaming_card_template_id, enabled, legacy_identity, created_at, updated_at)
        SELECT '飞书机器人', 'feishu', feishu_app_id, feishu_app_secret, NULL, feishu_domain,
          NULL, NULL, feishu_app_id IS NOT NULL AND feishu_app_secret IS NOT NULL,
          TRUE, NOW(), NOW()
        FROM llm_configurations
        WHERE id = 1 AND (feishu_app_id IS NOT NULL OR feishu_app_secret IS NOT NULL OR feishu_domain IS NOT NULL)
      `)
      await this.db.rawQuery(`
        INSERT INTO im_bots
          (name, channel, identifier, secret, tenant_id, endpoint, card_template_id,
           streaming_card_template_id, enabled, legacy_identity, created_at, updated_at)
        SELECT '钉钉机器人', 'dingtalk', dingtalk_client_id, dingtalk_client_secret, NULL, NULL,
          dingtalk_card_template_id, dingtalk_streaming_card_template_id,
          dingtalk_client_id IS NOT NULL AND dingtalk_client_secret IS NOT NULL,
          TRUE, NOW(), NOW()
        FROM llm_configurations
        WHERE id = 1 AND (dingtalk_client_id IS NOT NULL OR dingtalk_client_secret IS NOT NULL
          OR dingtalk_card_template_id IS NOT NULL OR dingtalk_streaming_card_template_id IS NOT NULL)
      `)
      await this.db.rawQuery(
        `ALTER TABLE llm_configurations ${legacyColumns
          .map((column) => `DROP COLUMN ${column}`)
          .join(', ')}`
      )
    }
  }

  async down() {
    const { rows } = await this.db.rawQuery(
      'SELECT COUNT(*)::int AS count FROM im_bots WHERE legacy_identity = FALSE'
    )
    if (Number(rows[0]?.count ?? 0) > 0) {
      throw new Error('Cannot roll back IM bot migration while additional bot configurations exist')
    }

    await this.db.rawQuery(`
      ALTER TABLE llm_configurations
        ADD COLUMN wecom_bot_id VARCHAR(160) NULL,
        ADD COLUMN wecom_bot_secret TEXT NULL,
        ADD COLUMN wecom_bot_tenant_id VARCHAR(160) NULL,
        ADD COLUMN wecom_bot_ws_url VARCHAR(500) NULL,
        ADD COLUMN feishu_app_id VARCHAR(160) NULL,
        ADD COLUMN feishu_app_secret TEXT NULL,
        ADD COLUMN feishu_domain VARCHAR(80) NULL,
        ADD COLUMN dingtalk_client_id VARCHAR(160) NULL,
        ADD COLUMN dingtalk_client_secret TEXT NULL,
        ADD COLUMN dingtalk_card_template_id VARCHAR(200) NULL,
        ADD COLUMN dingtalk_streaming_card_template_id VARCHAR(200) NULL
    `)
    await this.db.rawQuery(`
      UPDATE llm_configurations SET
        wecom_bot_id = bot.identifier, wecom_bot_secret = bot.secret,
        wecom_bot_tenant_id = bot.tenant_id, wecom_bot_ws_url = bot.endpoint
      FROM im_bots bot
      WHERE bot.channel = 'wecom' AND bot.legacy_identity = TRUE AND llm_configurations.id = 1
    `)
    await this.db.rawQuery(`
      UPDATE llm_configurations SET
        feishu_app_id = bot.identifier, feishu_app_secret = bot.secret, feishu_domain = bot.endpoint
      FROM im_bots bot
      WHERE bot.channel = 'feishu' AND bot.legacy_identity = TRUE AND llm_configurations.id = 1
    `)
    await this.db.rawQuery(`
      UPDATE llm_configurations SET
        dingtalk_client_id = bot.identifier, dingtalk_client_secret = bot.secret,
        dingtalk_card_template_id = bot.card_template_id,
        dingtalk_streaming_card_template_id = bot.streaming_card_template_id
      FROM im_bots bot
      WHERE bot.channel = 'dingtalk' AND bot.legacy_identity = TRUE AND llm_configurations.id = 1
    `)
    await this.schema.dropTable('im_bots')
  }
}
