import encryption from '@adonisjs/core/services/encryption'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`CREATE TABLE IF NOT EXISTS llm_configurations (
      id SERIAL PRIMARY KEY,
      chat_api_key TEXT NULL,
      chat_base_url VARCHAR(500) NULL,
      chat_model VARCHAR(160) NOT NULL DEFAULT 'gpt-4o-mini',
      embedding_api_key TEXT NULL,
      embedding_base_url VARCHAR(500) NULL,
      embedding_model VARCHAR(160) NULL,
      embedding_dimensions INTEGER NOT NULL DEFAULT 1024,
      request_timeout_ms INTEGER NOT NULL DEFAULT 180000,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )`)

    await this.db
      .table('llm_configurations')
      .insert({
        id: 1,
        chat_api_key: process.env.AI_OPENAI_API_KEY
          ? encryption.encrypt(process.env.AI_OPENAI_API_KEY)
          : null,
        chat_base_url: process.env.AI_OPENAI_BASE_URL ?? null,
        chat_model: process.env.AI_OPENAI_MODEL ?? 'gpt-4o-mini',
        embedding_api_key: process.env.AI_EMBEDDING_API_KEY
          ? encryption.encrypt(process.env.AI_EMBEDDING_API_KEY)
          : null,
        embedding_base_url: process.env.AI_EMBEDDING_BASE_URL ?? null,
        embedding_model: process.env.AI_EMBEDDING_MODEL ?? null,
        embedding_dimensions: Number(process.env.AI_EMBEDDING_DIMENSIONS ?? 1024),
        request_timeout_ms: Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 180000),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict('id')
      .ignore()
  }

  async down() {
    this.schema.dropTable('llm_configurations')
  }
}
