import crypto from 'node:crypto'

import db from '@adonisjs/lucid/services/db'

import KnowledgeDocument from '#models/knowledge_document'
import { getKnowledgeProvider } from '#services/knowledge_provider'

export { buildSemanticKnowledgeChunks, splitKnowledgeContent } from '#services/knowledge_chunking'
export { extractKnowledgeSearchTerms } from '#services/knowledge_chunking'
export type {
  KnowledgeCatalogSearchResult,
  KnowledgeProviderSearchResult as KnowledgeSearchResult,
} from '#services/knowledge_provider'

export type CreateKnowledgeDocumentInput = {
  title: string
  content: string
  enabled?: boolean
  summary?: string | null
  topics?: string[]
}

export type KnowledgeDocumentMetadata = Pick<CreateKnowledgeDocumentInput, 'summary' | 'topics'>

export function buildKnowledgeCatalogText(input: {
  title: string
  metadata: KnowledgeDocumentMetadata
}) {
  return [input.title, input.metadata.summary, ...(input.metadata.topics ?? [])]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n')
}

async function prepareDocument(content: string) {
  const chunks = await getKnowledgeProvider().prepareDocument(content)
  if (!chunks.length) throw new Error('知识文档标题和内容不能为空')
  return chunks
}

export async function createKnowledgeDocument(input: CreateKnowledgeDocumentInput) {
  const title = input.title.trim()
  const content = input.content.trim()
  const chunks = await prepareDocument(content)
  if (!title) throw new Error('知识文档标题和内容不能为空')

  const contentHash = crypto.createHash('sha256').update(content).digest('hex')
  const document = await db.transaction(async (trx) => {
    const created = new KnowledgeDocument()
    created.useTransaction(trx)
    created.fill({
      title,
      content,
      enabled: input.enabled ?? true,
      contentHash,
      summary: input.summary ?? null,
      topics: input.topics ?? [],
    })
    await created.save()
    return created
  })

  try {
    await getKnowledgeProvider().indexDocument({
      documentId: document.id,
      chunks,
      catalogText: buildKnowledgeCatalogText({
        title,
        metadata: input,
      }),
    })
  } catch (error) {
    await document.delete()
    throw error
  }
  return document
}

export async function indexKnowledgeDocument(document: KnowledgeDocument) {
  const chunks = await prepareDocument(document.content)
  const contentHash = crypto.createHash('sha256').update(document.content).digest('hex')
  const provider = getKnowledgeProvider()

  await provider.indexDocument({
    documentId: document.id,
    chunks,
    catalogText: buildKnowledgeCatalogText({
      title: document.title,
      metadata: document,
    }),
  })
  document.contentHash = contentHash
  await document.save()
}

export async function deleteKnowledgeDocument(document: KnowledgeDocument) {
  await document.delete()
}

export async function searchKnowledge(input: {
  query: string
  documentIds: number[]
  limit?: number
}) {
  const query = input.query.trim()
  if (!query) throw new Error('知识库检索内容不能为空')

  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10)
  const documentIds = [...new Set(input.documentIds)].filter((id) => Number.isInteger(id) && id > 0)
  if (!documentIds.length || documentIds.length > 10) {
    throw new Error('文档精检索必须限定在 1 到 10 个目录结果内')
  }

  return getKnowledgeProvider().search({
    query,
    documentIds,
    limit,
  })
}

export async function searchKnowledgeCatalog(input: { query: string; limit?: number }) {
  const query = input.query.trim()
  if (!query) throw new Error('知识库目录检索内容不能为空')

  const limit = Math.min(Math.max(input.limit ?? 12, 1), 12)

  return getKnowledgeProvider().searchCatalog({
    query,
    limit,
  })
}
