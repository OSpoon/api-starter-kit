import crypto from 'node:crypto'

import { Bouncer } from '@adonisjs/bouncer'
import db from '@adonisjs/lucid/services/db'
import OpenAI from 'openai'

import { access } from '#abilities/main'
import KnowledgeDocument from '#models/knowledge_document'
import type User from '#models/user'
import { loadUserAccess } from '#services/user_access'
import env from '#start/env'

const EMBEDDING_DIMENSIONS = 1024
const DEFAULT_CHUNK_LENGTH = 1800
const DEFAULT_CHUNK_OVERLAP = 200
const DEFAULT_SEMANTIC_BREAKPOINT_PERCENTILE = 90
const EMBEDDING_BATCH_SIZE = 32
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
  roleIds?: number[]
}

type KnowledgeSearchRow = {
  document_id: number
  document_title: string
  chunk_id: number
  content: string
  similarity: number | string
}

export function extractKnowledgeSearchTerms(query: string) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
  return [
    ...new Set(
      [...segmenter.segment(query.toLowerCase())]
        .filter((segment) => segment.isWordLike)
        .map((segment) => segment.segment.trim())
        .filter((term) => term.length >= 2)
    ),
  ].slice(0, 8)
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

type SemanticUnit = {
  content: string
  forceBoundaryBefore: boolean
}

function semanticChunkingOptions() {
  const maxLength = env.get('KNOWLEDGE_CHUNK_MAX_CHARACTERS') ?? DEFAULT_CHUNK_LENGTH
  const overlap = env.get('KNOWLEDGE_CHUNK_OVERLAP_CHARACTERS') ?? DEFAULT_CHUNK_OVERLAP
  const breakpointPercentile =
    env.get('KNOWLEDGE_SEMANTIC_BREAKPOINT_PERCENTILE') ?? DEFAULT_SEMANTIC_BREAKPOINT_PERCENTILE
  if (
    maxLength < 100 ||
    overlap < 0 ||
    overlap >= maxLength ||
    breakpointPercentile < 50 ||
    breakpointPercentile > 100
  ) {
    throw new Error('知识库语义分块参数无效')
  }
  return { maxLength, overlap, breakpointPercentile }
}

function splitSemanticUnits(content: string): SemanticUnit[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const units: SemanticUnit[] = []
  let startsParagraph = true

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      startsParagraph = true
      continue
    }

    const isHeading = /^(#{1,6}\s+|[-*+]\s+)/.test(line)
    const sentences = line.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [line]
    for (const [index, sentence] of sentences.entries()) {
      const normalized = sentence.trim()
      if (!normalized) continue
      units.push({
        content: normalized,
        forceBoundaryBefore: startsParagraph || (isHeading && index === 0),
      })
      startsParagraph = false
    }
  }
  return units
}

function cosineDistance(left: number[], right: number[]) {
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (const [index, value] of left.entries()) {
    dot += value * right[index]
    leftMagnitude += value * value
    rightMagnitude += right[index] * right[index]
  }
  if (!leftMagnitude || !rightMagnitude) return 0
  return 1 - dot / Math.sqrt(leftMagnitude * rightMagnitude)
}

function percentile(values: number[], value: number) {
  if (!values.length) return Number.POSITIVE_INFINITY
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor((value / 100) * sorted.length))]
}

function overlapUnits(units: string[], overlap: number) {
  const trailing: string[] = []
  let length = 0
  for (const unit of [...units].reverse()) {
    trailing.unshift(unit)
    length += unit.length + (trailing.length > 1 ? 1 : 0)
    if (length >= overlap) break
  }
  return trailing
}

export function buildSemanticKnowledgeChunks(input: {
  units: SemanticUnit[]
  distances: number[]
  maxLength: number
  overlap: number
  breakpointPercentile: number
}) {
  const { units, distances, maxLength, overlap, breakpointPercentile } = input
  if (!units.length) return []
  const threshold = percentile(distances, breakpointPercentile)
  const minLengthBeforeSemanticBreak = Math.floor(maxLength / 3)
  const chunks: string[] = []
  let current: string[] = []
  let currentLength = 0

  const flush = () => {
    const chunk = current.join(' ').trim()
    if (chunk) chunks.push(chunk)
    current = overlapUnits(current, overlap)
    currentLength = current.join(' ').length
  }

  for (const [index, unit] of units.entries()) {
    if (unit.content.length > maxLength) {
      if (current.length) flush()
      chunks.push(...splitKnowledgeContent(unit.content, maxLength, overlap))
      current = []
      currentLength = 0
      continue
    }

    const nextLength = currentLength + (current.length ? 1 : 0) + unit.content.length
    const semanticBoundary =
      index > 0 &&
      (unit.forceBoundaryBefore || distances[index - 1] >= threshold) &&
      currentLength >= minLengthBeforeSemanticBreak
    if (current.length && (nextLength > maxLength || semanticBoundary)) flush()
    current.push(unit.content)
    currentLength += (current.length > 1 ? 1 : 0) + unit.content.length
  }
  if (current.length) chunks.push(current.join(' ').trim())
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
  return new OpenAI({
    apiKey: config.apiKey,
    timeout: Math.min(Math.max(env.get('AI_REQUEST_TIMEOUT_MS') ?? 60_000, 5_000), 300_000),
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
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

async function embedVectors(texts: string[]) {
  const embeddings: number[][] = []
  const client = createEmbeddings()
  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const response = await client.embeddings.create({
      model: embeddingConfig().model,
      input: texts.slice(start, start + EMBEDDING_BATCH_SIZE),
    })
    const batch = response.data
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding)
    batch.forEach(vectorLiteral)
    embeddings.push(...batch)
  }
  return embeddings
}

async function embedTexts(texts: string[]) {
  const embeddings = await embedVectors(texts)
  return embeddings.map(vectorLiteral)
}

async function embedQuery(query: string) {
  const response = await createEmbeddings().embeddings.create({
    model: embeddingConfig().model,
    input: query,
  })
  return vectorLiteral(response.data[0]?.embedding ?? [])
}

async function splitKnowledgeContentSemantically(content: string) {
  const units = splitSemanticUnits(content)
  if (!units.length) return []
  if (units.length === 1) {
    const { maxLength, overlap } = semanticChunkingOptions()
    return splitKnowledgeContent(units[0].content, maxLength, overlap)
  }

  const vectors = await embedVectors(units.map((unit) => unit.content))
  const distances = vectors.slice(1).map((vector, index) => cosineDistance(vectors[index], vector))
  return buildSemanticKnowledgeChunks({
    units,
    distances,
    ...semanticChunkingOptions(),
  })
}

export async function createKnowledgeDocument(input: CreateKnowledgeDocumentInput) {
  const title = input.title.trim()
  const content = input.content.trim()
  const chunks = await splitKnowledgeContentSemantically(content)
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
  const chunks = await splitKnowledgeContentSemantically(document.content)
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
  const searchTerms = extractKnowledgeSearchTerms(query)
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10)
  const result = await db
    .rawQuery(
      `SELECT
         d.id AS document_id,
         d.title AS document_title,
         c.id AS chunk_id,
         c.content,
         1 - (c.embedding <=> ?::vector) AS similarity,
         (
           SELECT COUNT(*)::int
           FROM unnest(?::text[]) AS term
           WHERE strpos(lower(c.content), term) > 0
         ) AS lexical_matches
       FROM knowledge_chunks c
       INNER JOIN knowledge_documents d ON d.id = c.document_id
       WHERE (
           ?::boolean
           OR NOT EXISTS (
             SELECT 1 FROM knowledge_document_roles restricted WHERE restricted.document_id = d.id
           )
           OR EXISTS (
             SELECT 1 FROM knowledge_document_roles permitted
             WHERE permitted.document_id = d.id AND permitted.role_id = ANY(?::int[])
           )
         )
       ORDER BY
         (c.embedding <=> ?::vector) - LEAST((
           SELECT COUNT(*)::int
           FROM unnest(?::text[]) AS term
           WHERE strpos(lower(c.content), term) > 0
         ), 3) * 0.08,
         c.embedding <=> ?::vector
       LIMIT ?`,
      [
        embedding,
        searchTerms,
        accessState.isSuperAdmin,
        roleIds,
        embedding,
        searchTerms,
        embedding,
        limit,
      ]
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
