import type KnowledgeDocument from '#models/knowledge_document'

export function serializeKnowledgeDocument(document: KnowledgeDocument) {
  return {
    id: document.id,
    title: document.title,
    content: document.content,
    enabled: document.enabled,
    summary: document.summary,
    topics: document.topics ?? [],
    contentHash: document.contentHash,
    chunkCount: Number(document.$extras.chunks_count ?? 0),
    createdAt: document.createdAt.toISO(),
    updatedAt: document.updatedAt.toISO(),
  }
}
