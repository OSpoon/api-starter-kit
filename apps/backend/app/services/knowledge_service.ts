import crypto from 'node:crypto'

import { Bouncer } from '@adonisjs/bouncer'
import db from '@adonisjs/lucid/services/db'
import { OpenAIEmbeddings } from '@langchain/openai'

import { access } from '#abilities/main'
import KnowledgeDocument, { type KnowledgeDocumentStatus } from '#models/knowledge_document'
import type User from '#models/user'
import { loadUserAccess } from '#services/user_access'
import env from '#start/env'

const EMBEDDING_DIMENSIONS = 1024
const DEFAULT_CHUNK_LENGTH = 1800
const DEFAULT_CHUNK_OVERLAP = 200

export type KnowledgeAccess = {
  isSuperAdmin: boolean
  permissions: Set<string>
}

type KnowledgeAccessUser = {
  roles: Array<{ code: string; permissions: Array<{ code: string }> }>
}

export type KnowledgeSearchResult = {
  documentId: number
  title: string
  chunkId: number
  content: string
  similarity: number
}

export type CreateKnowledgeDocumentInput = {
  title: string
  content: string
  requiredPermission?: string | null
  status?: KnowledgeDocumentStatus
  roleIds?: number[]
}

type KnowledgeSearchRow = {
  document_id: number
  document_title: string
  chunk_id: number
  content: string
  similarity: number | string
}

export function splitKnowledgeContent(
  content: string,
  maxLength = DEFAULT_CHUNK_LENGTH,
  overlap = DEFAULT_CHUNK_OVERLAP
) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  if (maxLength < 100 || overlap < 0 || overlap >= maxLength) {
    throw new Error('知识库分块参数无效')
  }

  const chunks: string[] = []
  let start = 0
  while (start < normalized.length) {
    let end = Math.min(start + maxLength, normalized.length)
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(' ', end)
      if (boundary > start + Math.floor(maxLength / 2)) end = boundary
    }
    chunks.push(normalized.slice(start, end).trim())
    if (end === normalized.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return chunks
}

export function getKnowledgeAccess(user: KnowledgeAccessUser): KnowledgeAccess {
  const isSuperAdmin = user.roles.some((role) => role.code === 'super-admin')
  return {
    isSuperAdmin,
    permissions: new Set(
      user.roles.flatMap((role) => role.permissions.map((permission) => permission.code))
    ),
  }
}

export function canReadKnowledgeDocument(
  accessState: KnowledgeAccess,
  requiredPermission: string | null
) {
  return (
    accessState.isSuperAdmin ||
    !requiredPermission ||
    accessState.permissions.has(requiredPermission)
  )
}

function embeddingConfig() {
  const model = env.get('AI_EMBEDDING_MODEL')?.trim()
  if (!model) {
    throw new Error('AI_EMBEDDING_MODEL 未配置，无法检索知识库')
  }
  return {
    model,
    apiKey: env.get('AI_EMBEDDING_API_KEY') ?? env.get('AI_OPENAI_API_KEY') ?? 'no-key',
    baseURL: (env.get('AI_EMBEDDING_BASE_URL') ?? env.get('AI_OPENAI_BASE_URL'))?.replace(
      /\/+$/,
      ''
    ),
  }
}

function createEmbeddings() {
  const config = embeddingConfig()
  return new OpenAIEmbeddings({
    apiKey: config.apiKey,
    model: config.model,
    timeout: Math.min(Math.max(env.get('AI_REQUEST_TIMEOUT_MS') ?? 60_000, 5_000), 300_000),
    configuration: { baseURL: config.baseURL },
  })
}

function vectorLiteral(vector: number[]) {
  const dimensions = env.get('AI_EMBEDDING_DIMENSIONS') ?? EMBEDDING_DIMENSIONS
  if (dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error(`当前数据库仅支持 ${EMBEDDING_DIMENSIONS} 维 embedding`)
  }
  if (vector.length !== dimensions || vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`Embedding 维度必须为 ${dimensions}`)
  }
  return `[${vector.join(',')}]`
}

async function embedTexts(texts: string[]) {
  const embeddings = await createEmbeddings().embedDocuments(texts)
  return embeddings.map(vectorLiteral)
}

async function embedQuery(query: string) {
  return vectorLiteral(await createEmbeddings().embedQuery(query))
}

export async function createKnowledgeDocument(input: CreateKnowledgeDocumentInput) {
  const title = input.title.trim()
  const content = input.content.trim()
  const chunks = splitKnowledgeContent(content)
  if (!title || !chunks.length) throw new Error('知识文档标题和内容不能为空')

  const embeddings = await embedTexts(chunks)
  const contentHash = crypto.createHash('sha256').update(content).digest('hex')
  const embeddingModel = embeddingConfig().model

  return db.transaction(async (trx) => {
    const document = new KnowledgeDocument()
    document.useTransaction(trx)
    document.fill({
      title,
      content,
      contentHash,
      requiredPermission: input.requiredPermission ?? null,
      status: input.status ?? 'draft',
    })
    await document.save()
    if (input.roleIds) await document.related('roles').sync(input.roleIds)
    for (const [chunkIndex, chunkContent] of chunks.entries()) {
      await trx.rawQuery(
        `INSERT INTO knowledge_chunks (document_id, chunk_index, content, embedding, embedding_model)
         VALUES (?, ?, ?, ?::vector, ?)`,
        [document.id, chunkIndex, chunkContent, embeddings[chunkIndex], embeddingModel]
      )
    }
    return document
  })
}

/**
 * Rebuilds all vector chunks for an existing document. Call this only after the
 * document content has passed the application's secret-handling review.
 */
export async function indexKnowledgeDocument(document: KnowledgeDocument) {
  const chunks = splitKnowledgeContent(document.content)
  if (!chunks.length) throw new Error('知识文档内容不能为空')

  const embeddings = await embedTexts(chunks)
  const contentHash = crypto.createHash('sha256').update(document.content).digest('hex')
  const embeddingModel = embeddingConfig().model

  await db.transaction(async (trx) => {
    document.useTransaction(trx)
    document.contentHash = contentHash
    await document.save()
    await trx.from('knowledge_chunks').where('document_id', document.id).delete()
    for (const [chunkIndex, content] of chunks.entries()) {
      await trx.rawQuery(
        `INSERT INTO knowledge_chunks (document_id, chunk_index, content, embedding, embedding_model)
         VALUES (?, ?, ?, ?::vector, ?)`,
        [document.id, chunkIndex, content, embeddings[chunkIndex], embeddingModel]
      )
    }
  })
}

export async function searchKnowledge(input: { user: User; query: string; limit?: number }) {
  const query = input.query.trim()
  if (!query) throw new Error('知识库检索内容不能为空')

  const bouncer = new Bouncer(() => input.user, { access })
  if (!(await bouncer.allows('access', 'knowledge:read'))) {
    throw new Error('当前账号没有执行此操作的权限')
  }
  await loadUserAccess(input.user)
  const accessState = getKnowledgeAccess(input.user)
  const roleIds = input.user.roles.map((role) => role.id)
  const embedding = await embedQuery(query)
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10)
  const result = await db
    .rawQuery(
      `SELECT
         d.id AS document_id,
         d.title AS document_title,
         c.id AS chunk_id,
         c.content,
         1 - (c.embedding <=> ?::vector) AS similarity
       FROM knowledge_chunks c
       INNER JOIN knowledge_documents d ON d.id = c.document_id
       WHERE d.status = 'published'
         AND (
           ?::boolean
           OR NOT EXISTS (
             SELECT 1 FROM knowledge_document_roles restricted WHERE restricted.document_id = d.id
           )
           OR EXISTS (
             SELECT 1 FROM knowledge_document_roles permitted
             WHERE permitted.document_id = d.id AND permitted.role_id = ANY(?::int[])
           )
         )
       ORDER BY c.embedding <=> ?::vector
       LIMIT ?`,
      [embedding, accessState.isSuperAdmin, roleIds, embedding, limit]
    )
    .exec()

  return ((result as { rows: KnowledgeSearchRow[] }).rows ?? []).map((row) => ({
    documentId: Number(row.document_id),
    title: row.document_title,
    chunkId: Number(row.chunk_id),
    content: row.content,
    similarity: Number(row.similarity),
  })) satisfies KnowledgeSearchResult[]
}
