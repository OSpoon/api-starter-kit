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
export type { KnowledgeProviderSearchResult as KnowledgeSearchResult } from '#services/knowledge_provider'

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
  requiredPermission?: string | null
  roleIds?: number[]
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
      requiredPermission: input.requiredPermission ?? null,
    })
    await created.save()
    if (input.roleIds) await created.related('roles').sync(input.roleIds)
    return created
  })

  try {
    await getKnowledgeProvider().indexDocument({ documentId: document.id, chunks })
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

  await provider.indexDocument({ documentId: document.id, chunks })
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

  return getKnowledgeProvider().search({
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
