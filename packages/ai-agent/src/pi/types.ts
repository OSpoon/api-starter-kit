import type { AgentMessage } from '@earendil-works/pi-agent-core'

import type { AgentModelUsage } from '../agent.js'

export type PiAgentMessage = AgentMessage & {
  sourceMessageId?: number
  isContextSummary?: boolean
}

export type PiModelUsage = AgentModelUsage
