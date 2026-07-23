import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.schema.raw('CREATE EXTENSION IF NOT EXISTS vector')
    await this.schema.raw(`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id BIGSERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        required_permission VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
        content_hash CHAR(64) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await this.schema.raw(`
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id BIGSERIAL PRIMARY KEY,
        document_id BIGINT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1536) NOT NULL,
        embedding_model VARCHAR(120) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (document_id, chunk_index)
      )
    `)
    await this.schema.raw(
      'CREATE INDEX IF NOT EXISTS knowledge_documents_status_permission_idx ON knowledge_documents (status, required_permission)'
    )
    await this.schema.raw(
      'CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)'
    )
  }

  async down() {
    await this.schema.raw('DROP TABLE IF EXISTS knowledge_chunks')
    await this.schema.raw('DROP TABLE IF EXISTS knowledge_documents')
  }
}
