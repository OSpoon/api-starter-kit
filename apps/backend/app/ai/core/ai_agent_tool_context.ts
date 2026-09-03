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
}

export interface AiAgentToolContext extends AiAgentToolRequestContext {
  agentRunId: string
}
