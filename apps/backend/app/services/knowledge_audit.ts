import crypto from 'node:crypto'

import AuditLog from '#models/audit_log'

export type KnowledgeSearchAuditStage = 'catalog' | 'detail'
export type KnowledgeSearchAuditAuthorization = 'allowed' | 'denied' | 'failed'

export function buildKnowledgeSearchAuditMetadata(input: {
  query: string
  stage: KnowledgeSearchAuditStage
  authorization: KnowledgeSearchAuditAuthorization
  resultCount?: number
  candidateDocumentCount?: number
  selectedDocumentCount?: number
  publicOnly?: boolean
  durationMs: number
}) {
  return {
    stage: input.stage,
    queryHash: crypto.createHash('sha256').update(input.query.trim()).digest('hex'),
    authorization: input.authorization,
    ...(input.resultCount === undefined ? {} : { resultCount: input.resultCount }),
    ...(input.candidateDocumentCount === undefined
      ? {}
      : { candidateDocumentCount: input.candidateDocumentCount }),
    ...(input.selectedDocumentCount === undefined
      ? {}
      : { selectedDocumentCount: input.selectedDocumentCount }),
    ...(input.publicOnly === undefined ? {} : { publicOnly: input.publicOnly }),
    durationMs: Math.max(0, Math.round(input.durationMs)),
  }
}

export async function recordKnowledgeSearchAudit(input: {
  userId: number
  query: string
  stage: KnowledgeSearchAuditStage
  authorization: KnowledgeSearchAuditAuthorization
  resultCount?: number
  candidateDocumentCount?: number
  selectedDocumentCount?: number
  publicOnly?: boolean
  durationMs: number
}) {
  await AuditLog.create({
    actorUserId: input.userId,
    action: input.stage === 'catalog' ? 'knowledge.catalog_searched' : 'knowledge.searched',
    targetType: input.stage === 'catalog' ? 'knowledge_catalog' : 'knowledge_search',
    metadata: buildKnowledgeSearchAuditMetadata(input),
  })
}
