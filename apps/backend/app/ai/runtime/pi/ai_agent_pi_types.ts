import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { Usage } from '@earendil-works/pi-ai'

export type PiAgentMessage = AgentMessage & {
  sourceMessageId?: number
  isContextSummary?: boolean
}

export type PiModelUsage = {
  providerId: string
  modelId: string
  baseUrl: string
  usage: Usage
  status: 'completed' | 'failed'
}
