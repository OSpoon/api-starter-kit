import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.schema.raw('DROP INDEX IF EXISTS knowledge_chunks_embedding_idx')
    // Embeddings are derived data. They cannot be converted between model dimensions.
    await this.schema.raw('DELETE FROM knowledge_chunks')
    await this.schema.raw(
      'ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE vector(1024) USING embedding::vector(1024)'
    )
    await this.schema.raw(
      'CREATE INDEX knowledge_chunks_embedding_idx ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)'
    )
    await this.schema.raw(`
      CREATE TABLE IF NOT EXISTS knowledge_document_roles (
        document_id BIGINT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (document_id, role_id)
      )
    `)
    await this.schema.raw(
      'CREATE INDEX IF NOT EXISTS knowledge_document_roles_role_idx ON knowledge_document_roles (role_id, document_id)'
    )
  }

  async down() {
    await this.schema.raw('DROP TABLE IF EXISTS knowledge_document_roles')
    await this.schema.raw('DROP INDEX IF EXISTS knowledge_chunks_embedding_idx')
    await this.schema.raw(
      'ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector(1536)'
    )
    await this.schema.raw(
      'CREATE INDEX knowledge_chunks_embedding_idx ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)'
    )
  }
}
