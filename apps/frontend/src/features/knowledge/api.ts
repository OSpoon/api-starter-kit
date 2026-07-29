import { apiRequest } from '@/lib/api'
import { readItem } from '@/lib/api-types'

export interface KnowledgeDocument {
  id: number
  title: string
  content: string
  requiredPermission: string | null
  contentHash: string
  chunkCount: number
  roles: Array<{ id: number; code: string; name: string }>
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocumentPage {
  items: KnowledgeDocument[]
  meta: { currentPage: number; lastPage: number }
}

export type KnowledgeDocumentInput = {
  file?: File | null
  roleIds: number[]
}

function authOptions(token: string | null) {
  return { token }
}

export async function listKnowledgeDocuments(token: string | null, page = 1) {
  return readItem(
    await apiRequest<KnowledgeDocumentPage>(
      `/api/v1/system/knowledge-documents?page=${page}&limit=20`,
      authOptions(token)
    )
  )
}

function asFormData(input: KnowledgeDocumentInput, requireFile: boolean) {
  if (requireFile && !input.file) throw new Error('请选择纯文本文件')
  const form = new FormData()
  if (input.file) form.append('file', input.file)
  form.append('roleIds', JSON.stringify(input.roleIds))
  return form
}

export async function createKnowledgeDocument(token: string | null, input: KnowledgeDocumentInput) {
  return readItem(
    await apiRequest<KnowledgeDocument>('/api/v1/system/knowledge-documents', {
      ...authOptions(token),
      method: 'POST',
      body: asFormData(input, true),
    })
  )
}

export async function updateKnowledgeDocument(
  token: string | null,
  id: number,
  input: KnowledgeDocumentInput
) {
  return readItem(
    await apiRequest<KnowledgeDocument>(`/api/v1/system/knowledge-documents/${id}`, {
      ...authOptions(token),
      method: 'PUT',
      body: asFormData(input, false),
    })
  )
}

export async function reindexKnowledgeDocument(token: string | null, id: number) {
  return readItem(
    await apiRequest<KnowledgeDocument>(`/api/v1/system/knowledge-documents/${id}/reindex`, {
      ...authOptions(token),
      method: 'POST',
    })
  )
}

export async function deleteKnowledgeDocument(token: string | null, id: number) {
  return readItem(
    await apiRequest<{ id: number; deleted: boolean }>(`/api/v1/system/knowledge-documents/${id}`, {
      ...authOptions(token),
      method: 'DELETE',
    })
  )
}
