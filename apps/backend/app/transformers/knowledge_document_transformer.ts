import type KnowledgeDocument from '#models/knowledge_document'

export function serializeKnowledgeDocument(document: KnowledgeDocument) {
  return {
    id: document.id,
    title: document.title,
    content: document.content,
    requiredPermission: document.requiredPermission,
    status: document.status,
    contentHash: document.contentHash,
    chunkCount: Number(document.$extras.chunks_count ?? 0),
    roles: document.roles?.map((role) => ({ id: role.id, code: role.code, name: role.name })) ?? [],
    createdAt: document.createdAt.toISO(),
    updatedAt: document.updatedAt.toISO(),
  }
}
