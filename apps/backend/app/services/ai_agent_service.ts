import crypto from 'node:crypto'

import type { AiAgentPageContext } from '#services/ai_agent_prompt_policy'
import { getPendingAiQueryContext } from '#services/ai_agent_query_registry'
import type { AiAgentToolRequestContext } from '#services/ai_agent_tool_context'
import { createAiAgentPiStream } from '#services/ai_agent_pi_stream'
import type { AiAgentMessage } from '#services/ai_agent_types'

export type { AiAgentMessage } from '#services/ai_agent_types'
export {
  type AiAgentPageContext,
  createAiAgentSystemPrompt,
} from '#services/ai_agent_prompt_policy'
export {
  getAiAgentModelName,
  getAiAgentSummarizationOptions,
  getAiRequestTimeout,
} from '#services/ai_agent_config'

async function buildLiveSessionContext(conversationId: number, userId: number) {
  try {
    const pendingQueryContext = await getPendingAiQueryContext({ conversationId, userId })
    return `${pendingQueryContext}`
  } catch {
    return ''
  }
}

export async function createAiAgentStream(
  input: AiAgentToolRequestContext & {
    messages: AiAgentMessage[]
    context?: AiAgentPageContext
    resume?: boolean
    aiSummaryCandidateBoundaryId?: number
  }
) {
  const agentRunId = crypto.randomUUID()
  const liveSessionContext = await buildLiveSessionContext(input.conversationId, input.userId)
  return {
    stream: createAiAgentPiStream({
      ...input,
      messages: input.messages,
      agentRunId,
      liveSessionContext,
    }),
    agentRunId,
  }
}
