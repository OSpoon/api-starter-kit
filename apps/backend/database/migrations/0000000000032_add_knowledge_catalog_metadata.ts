import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'knowledge_documents'

  async up() {
    await this.db.rawQuery(`
      ALTER TABLE ${this.tableName}
        ADD COLUMN IF NOT EXISTS source_name VARCHAR(200),
        ADD COLUMN IF NOT EXISTS document_type VARCHAR(120),
        ADD COLUMN IF NOT EXISTS subject VARCHAR(200),
        ADD COLUMN IF NOT EXISTS summary TEXT,
        ADD COLUMN IF NOT EXISTS topics JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS catalog_embedding vector(1024),
        ADD COLUMN IF NOT EXISTS catalog_embedding_model VARCHAR(120),
        ADD COLUMN IF NOT EXISTS catalog_indexed_at TIMESTAMPTZ
    `)
    await this.db.rawQuery(`
      CREATE INDEX IF NOT EXISTS knowledge_documents_catalog_embedding_idx
      ON knowledge_documents USING hnsw (catalog_embedding vector_cosine_ops)
      WHERE catalog_embedding IS NOT NULL
    `)
  }

  async down() {
    await this.db.rawQuery('DROP INDEX IF EXISTS knowledge_documents_catalog_embedding_idx')
    await this.db.rawQuery(`
      ALTER TABLE ${this.tableName}
        DROP COLUMN IF EXISTS catalog_indexed_at,
        DROP COLUMN IF EXISTS catalog_embedding_model,
        DROP COLUMN IF EXISTS catalog_embedding,
        DROP COLUMN IF EXISTS topics,
        DROP COLUMN IF EXISTS summary,
        DROP COLUMN IF EXISTS subject,
        DROP COLUMN IF EXISTS document_type,
        DROP COLUMN IF EXISTS source_name
    `)
  }
}
