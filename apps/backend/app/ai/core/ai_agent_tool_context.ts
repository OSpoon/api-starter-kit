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

export type AiAgentMcpDiscoveryStatus = {
  callId: string
  serverName: string
  state: 'running' | 'done' | 'error'
  startedAt: number
  durationMs?: number
  toolCount?: number
  tools?: Array<{ name: string; mode?: 'read' | 'confirm' }>
}

export interface AiAgentToolRequestContext {
  userId: number
  conversationId: number
  auditContext?: HttpContext
  capabilityMode?: AiAgentCapabilityMode
  signal?: AbortSignal
  onKnowledgeSources?: (sources: AiAgentKnowledgeSource[]) => void
  onCredentialDisclosure?: (credential: AiAgentCredentialDisclosure) => void | Promise<void>
  onMcpDiscovery?: (status: AiAgentMcpDiscoveryStatus) => void | Promise<void>
  knowledgeCatalogDocumentIds?: Set<number>
  enabledToolNames?: string[]
}

export interface AiAgentToolContext extends AiAgentToolRequestContext {
  agentRunId: string
}
