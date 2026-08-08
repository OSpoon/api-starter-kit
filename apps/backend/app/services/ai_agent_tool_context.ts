export type AiAgentKnowledgeSource = {
  documentId: number
  chunkId: number
  title: string
  excerpt: string
}

export interface AiAgentToolRequestContext {
  userId: number
  conversationId: number
  signal?: AbortSignal
  onKnowledgeSources?: (sources: AiAgentKnowledgeSource[]) => void
}

export interface AiAgentToolContext extends AiAgentToolRequestContext {
  agentRunId: string
}
