import crypto from 'node:crypto'

import { Bouncer } from '@adonisjs/bouncer'
import db from '@adonisjs/lucid/services/db'

import { access } from '#abilities/main'
import KnowledgeDocument from '#models/knowledge_document'
import type User from '#models/user'
import { getKnowledgeProvider } from '#services/knowledge_provider'
import { loadUserAccess } from '#services/user_access'

export { buildSemanticKnowledgeChunks, splitKnowledgeContent } from '#services/knowledge_chunking'
export { extractKnowledgeSearchTerms } from '#services/knowledge_chunking'
export type {
  KnowledgeCatalogSearchResult,
  KnowledgeProviderSearchResult as KnowledgeSearchResult,
} from '#services/knowledge_provider'

export type KnowledgeAccess = {
  isSuperAdmin: boolean
  permissions: Set<string>
}

type KnowledgeAccessUser = {
  roles: Array<{ code: string; permissions: Array<{ code: string }> }>
}

export type CreateKnowledgeDocumentInput = {
  title: string
  content: string
  summary?: string | null
  topics?: string[]
  roleIds?: number[]
}

export type KnowledgeDocumentMetadata = Pick<
  CreateKnowledgeDocumentInput,
  'summary' | 'topics'
>

export function buildKnowledgeCatalogText(input: {
  title: string
  metadata: KnowledgeDocumentMetadata
}) {
  return [
    input.title,
    input.metadata.summary,
    ...(input.metadata.topics ?? []),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n')
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
      contentHash,
      summary: input.summary ?? null,
      topics: input.topics ?? [],
    })
    await created.save()
    if (input.roleIds) await created.related('roles').sync(input.roleIds)
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
  await getKnowledgeProvider().deleteDocument({ documentId: document.id })
  await document.delete()
}

export async function searchKnowledge(input: {
  user: User
  query: string
  documentIds: number[]
  limit?: number
  publicOnly?: boolean
}) {
  const query = input.query.trim()
  if (!query) throw new Error('知识库检索内容不能为空')

  const bouncer = new Bouncer(() => input.user, { access })
  if (!(await bouncer.allows('access', 'knowledge:read'))) {
    throw new Error('当前账号没有执行此操作的权限')
  }
  await loadUserAccess(input.user)
  const accessState = getKnowledgeAccess(input.user)
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10)
  const documentIds = [...new Set(input.documentIds)].filter((id) => Number.isInteger(id) && id > 0)
  if (!documentIds.length || documentIds.length > 10) {
    throw new Error('文档精检索必须限定在 1 到 10 个目录结果内')
  }

  return getKnowledgeProvider().search({
    query,
    documentIds,
    access: input.publicOnly
      ? { isSuperAdmin: false, roleIds: [] }
      : {
          isSuperAdmin: accessState.isSuperAdmin,
          roleIds: input.user.roles.map((role) => role.id),
        },
    limit,
  })
}

export async function searchKnowledgeCatalog(input: {
  user: User
  query: string
  limit?: number
  publicOnly?: boolean
}) {
  const query = input.query.trim()
  if (!query) throw new Error('知识库目录检索内容不能为空')

  const bouncer = new Bouncer(() => input.user, { access })
  if (!(await bouncer.allows('access', 'knowledge:read'))) {
    throw new Error('当前账号没有执行此操作的权限')
  }
  await loadUserAccess(input.user)
  const accessState = getKnowledgeAccess(input.user)
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 12)

  return getKnowledgeProvider().searchCatalog({
    query,
    access: input.publicOnly
      ? { isSuperAdmin: false, roleIds: [] }
      : {
          isSuperAdmin: accessState.isSuperAdmin,
          roleIds: input.user.roles.map((role) => role.id),
        },
    limit,
  })
}
