import crypto from 'node:crypto'

import { createAiAgentPiStream } from '#ai/ai_agent_pi_stream'
import type { AiAgentPageContext } from '#ai/ai_agent_prompt_policy'
import { getPendingAiQueryContext } from '#ai/ai_agent_query_registry'
import type { AiAgentToolRequestContext } from '#ai/ai_agent_tool_context'
import type { AiAgentMessage } from '#ai/ai_agent_types'

export {
  getAiAgentModelName,
  getAiAgentSummarizationOptions,
  getAiRequestTimeout,
} from '#ai/ai_agent_config'
export { type AiAgentPageContext, createAiAgentSystemPrompt } from '#ai/ai_agent_prompt_policy'
export type { AiAgentMessage } from '#ai/ai_agent_types'

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
  }
) {
  const agentRunId = crypto.randomUUID()
  const liveSessionContext = await buildLiveSessionContext(input.conversationId, input.userId)
  return {
    stream: createAiAgentPiStream({
      ...input,
      agentRunId,
      liveSessionContext,
    }),
    agentRunId,
  }
}
