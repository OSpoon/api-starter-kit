export type AiAgentKnowledgeSource = {
  documentId: number
  chunkId: number
  title: string
  excerpt: string
}

export type AiAgentCapabilityMode = 'full' | 'knowledge-only'

export interface AiAgentToolRequestContext {
  userId: number
  conversationId: number
  capabilityMode?: AiAgentCapabilityMode
  signal?: AbortSignal
  onKnowledgeSources?: (sources: AiAgentKnowledgeSource[]) => void
  knowledgeCatalogDocumentIds?: Set<number>
}

export interface AiAgentToolContext extends AiAgentToolRequestContext {
  agentRunId: string
}
