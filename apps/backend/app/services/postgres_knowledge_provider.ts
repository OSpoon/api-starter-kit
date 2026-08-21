import db from '@adonisjs/lucid/services/db'
import OpenAI from 'openai'

import {
  buildSemanticKnowledgeChunks,
  extractKnowledgeSearchTerms,
  semanticChunkingOptions,
  splitKnowledgeContent,
  splitSemanticUnits,
} from '#services/knowledge_chunking'
import type {
  KnowledgeProvider,
  KnowledgeProviderAccess,
  KnowledgeProviderSearchResult,
} from '#services/knowledge_provider'
import { readRuntimeLlmConfiguration } from '#services/llm_configuration_service'

const EMBEDDING_DIMENSIONS = 1024
const EMBEDDING_BATCH_SIZE = 32

type KnowledgeSearchRow = {
  document_id: number
  document_title: string
  chunk_id: number
  content: string
  similarity: number | string
}

async function embeddingConfig() {
  const runtime = await readRuntimeLlmConfiguration()
  const model = runtime.embedding.model?.trim()
  if (!model) throw new Error('LLM 配置中的 Embedding 模型未配置，无法检索知识库')
  return {
    model,
    apiKey: runtime.embedding.apiKey,
    baseURL: runtime.embedding.baseURL?.replace(/\/+$/, ''),
    dimensions: runtime.embedding.dimensions,
  }
}

async function createEmbeddings() {
  const config = await embeddingConfig()
  const runtime = await readRuntimeLlmConfiguration()
  return new OpenAI({
    apiKey: config.apiKey,
    timeout: runtime.requestTimeoutMs,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  })
}

function vectorLiteral(vector: number[]) {
  const dimensions = EMBEDDING_DIMENSIONS
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
  const client = await createEmbeddings()
  const config = await embeddingConfig()
  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const model = config.model
    const response = await client.embeddings.create({
      model,
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
  const client = await createEmbeddings()
  const config = await embeddingConfig()
  const response = await client.embeddings.create({ model: config.model, input: query })
  return vectorLiteral(response.data[0]?.embedding ?? [])
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

export default class PostgresKnowledgeProvider implements KnowledgeProvider {
  async prepareDocument(content: string) {
    const units = splitSemanticUnits(content)
    if (!units.length) return []
    if (units.length === 1) {
      const { maxLength, overlap } = semanticChunkingOptions()
      return splitKnowledgeContent(units[0].content, maxLength, overlap)
    }

    const vectors = await embedVectors(units.map((unit) => unit.content))
    const distances = vectors
      .slice(1)
      .map((vector, index) => cosineDistance(vectors[index], vector))
    return buildSemanticKnowledgeChunks({
      units,
      distances,
      ...semanticChunkingOptions(),
    })
  }

  async indexDocument(input: { documentId: number; chunks: string[] }) {
    const embeddings = await embedTexts(input.chunks)
    const embeddingConfigValue = await embeddingConfig()
    const embeddingModel = embeddingConfigValue.model
    await db.transaction(async (trx) => {
      await trx.from('knowledge_chunks').where('document_id', input.documentId).delete()
      for (const [chunkIndex, content] of input.chunks.entries()) {
        await trx.rawQuery(
          `INSERT INTO knowledge_chunks (document_id, chunk_index, content, embedding, embedding_model)
           VALUES (?, ?, ?, ?::vector, ?)`,
          [input.documentId, chunkIndex, content, embeddings[chunkIndex], embeddingModel]
        )
      }
    })
  }

  async deleteDocument(input: { documentId: number }) {
    await db.from('knowledge_chunks').where('document_id', input.documentId).delete()
  }

  async search(input: {
    query: string
    access: KnowledgeProviderAccess
    limit: number
  }): Promise<KnowledgeProviderSearchResult[]> {
    const embedding = await embedQuery(input.query)
    const searchTerms = extractKnowledgeSearchTerms(input.query)
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
         (c.embedding <=> ?::vector) - LEAST( (
           SELECT COUNT(*)::int FROM unnest(?::text[]) AS term
           WHERE strpos(lower(c.content), term) > 0
         ), 3) * 0.08,
         c.embedding <=> ?::vector
       LIMIT ?`,
        [
          embedding,
          input.access.isSuperAdmin,
          input.access.roleIds,
          embedding,
          searchTerms,
          embedding,
          input.limit,
        ]
      )
      .exec()

    return ((result as { rows: KnowledgeSearchRow[] }).rows ?? []).map((row) => ({
      documentId: Number(row.document_id),
      title: row.document_title,
      chunkId: Number(row.chunk_id),
      content: row.content,
      similarity: Number(row.similarity),
    }))
  }
}
