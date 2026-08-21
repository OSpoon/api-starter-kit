import PostgresKnowledgeProvider from '#services/postgres_knowledge_provider'
import env from '#start/env'

export type KnowledgeProviderSearchResult = {
  documentId: number
  title: string
  chunkId: number
  content: string
  similarity: number
}

export type KnowledgeProviderAccess = {
  isSuperAdmin: boolean
  roleIds: number[]
}

export interface KnowledgeProvider {
  prepareDocument(content: string): Promise<string[]>
  indexDocument(input: { documentId: number; chunks: string[] }): Promise<void>
  deleteDocument(input: { documentId: number }): Promise<void>
  search(input: {
    query: string
    access: KnowledgeProviderAccess
    limit: number
  }): Promise<KnowledgeProviderSearchResult[]>
}

let provider: KnowledgeProvider | undefined

export function getKnowledgeProvider(): KnowledgeProvider {
  if (provider) return provider

  const providerName = env.get('KNOWLEDGE_PROVIDER') ?? 'postgres'
  if (providerName !== 'postgres') {
    throw new Error(`不支持的知识库 Provider: ${providerName}`)
  }

  provider = new PostgresKnowledgeProvider()
  return provider
}

export function resetKnowledgeProviderForTests() {
  provider = undefined
}
