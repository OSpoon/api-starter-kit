import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.schema.raw('DROP INDEX IF EXISTS knowledge_documents_status_permission_idx')
    await this.schema.raw('ALTER TABLE knowledge_documents DROP COLUMN IF EXISTS status')
  }

  async down() {
    await this.schema.raw(
      "ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published'))"
    )
    await this.schema.raw(
      'CREATE INDEX IF NOT EXISTS knowledge_documents_status_permission_idx ON knowledge_documents (status, required_permission)'
    )
  }
}
