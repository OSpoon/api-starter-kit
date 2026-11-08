import type { HttpContext } from '@adonisjs/core/http'

export type AiAgentKnowledgeSource = {
  documentId: number
  chunkId: number
  title: string
  excerpt: string
}

export type AiAgentCredentialDisclosure = {
  kind: 'api_key' | 'password'
  value: string
  label: string
}

export type AiAgentCapabilityMode = 'full' | 'channel' | 'knowledge-only'

export type AiAgentTaskPlanStep = {
  key: string
  label: string
  state: 'pending' | 'running' | 'done'
}

export interface AiAgentToolRequestContext {
  userId: number
  conversationId: number
  auditContext?: HttpContext
  capabilityMode?: AiAgentCapabilityMode
  signal?: AbortSignal
  onKnowledgeSources?: (sources: AiAgentKnowledgeSource[]) => void
  onCredentialDisclosure?: (credential: AiAgentCredentialDisclosure) => void | Promise<void>
  onTaskPlanUpdate?: (steps: AiAgentTaskPlanStep[]) => void | Promise<void>
  knowledgeCatalogDocumentIds?: Set<number>
  enabledToolNames?: string[]
}

export interface AiAgentToolContext extends AiAgentToolRequestContext {
  agentRunId: string
}
