import crypto from 'node:crypto'

import {
  getAiAgentCheckpointConfig,
  getAiAgentCheckpointer,
  hasAiAgentCheckpoint,
} from '#services/ai_agent_checkpoint'
import {
  type AiAgentGraphMessage,
  createAiAgentGraph,
  toAiAgentGraphMessages,
} from '#services/ai_agent_graph'
import type { AiAgentPageContext } from '#services/ai_agent_prompt_policy'
import { getPendingAiQueryContext } from '#services/ai_agent_query_registry'
import type { AiAgentToolRequestContext } from '#services/ai_agent_tool_context'
import { createLangfuseCallback } from '#services/langfuse'

export type { AiAgentGraphMessage as AiAgentMessage } from '#services/ai_agent_graph'
export {
  type AiAgentPageContext,
  createAiAgentSystemPrompt,
} from '#services/ai_agent_prompt_policy'
export {
  createAiAgentModel,
  getAiAgentModelName,
  getAiAgentSummarizationOptions,
  getAiRequestTimeout,
} from '#services/ai_agent_runtime'

async function buildLiveSessionContext(conversationId: number, userId: number) {
  try {
    const pendingQueryContext = await getPendingAiQueryContext({ conversationId, userId })
    return `${pendingQueryContext}`
  } catch {
    return ''
  }
}

export function selectAiAgentInvocationMessages(input: {
  messages: AiAgentGraphMessage[]
  hasCheckpoint: boolean
}) {
  if (!input.hasCheckpoint) return input.messages
  const latestMessage = input.messages.at(-1)
  if (!latestMessage) throw new Error('AI agent invocation is missing a user message')
  return [latestMessage]
}

export async function createAiAgentStream(
  input: AiAgentToolRequestContext & {
    messages: AiAgentGraphMessage[]
    context?: AiAgentPageContext
    resume?: boolean
    aiSummaryCandidateBoundaryId?: number
  }
) {
  const agentRunId = crypto.randomUUID()
  const langfuseCallback = createLangfuseCallback({
    userId: input.userId,
    conversationId: input.conversationId,
    agentRunId,
  })
  const liveSessionContext = await buildLiveSessionContext(input.conversationId, input.userId)
  const checkpointInput = { conversationId: input.conversationId, userId: input.userId }
  const hasCheckpoint = await hasAiAgentCheckpoint(checkpointInput)
  if (input.resume && !hasCheckpoint) {
    throw new Error('没有可恢复的 AI 运行状态')
  }
  const messages = input.resume
    ? []
    : selectAiAgentInvocationMessages({
        messages: input.messages,
        hasCheckpoint,
      })
  const { agent } = createAiAgentGraph({
    ...input,
    agentRunId,
    liveSessionContext,
    checkpointer: getAiAgentCheckpointer(),
  })

  const stream = await agent.streamEvents(
    input.resume
      ? null
      : {
          messages: toAiAgentGraphMessages(messages),
        },
    {
      version: 'v3',
      signal: input.signal,
      // The graph counts model and tool nodes separately. Keep this above
      // the middleware call/tool budgets so those safeguards can terminate
      // the run before LangGraph's generic recursion guard does.
      recursionLimit: 50,
      ...getAiAgentCheckpointConfig(checkpointInput),
      ...(langfuseCallback ? { callbacks: [langfuseCallback] } : {}),
    }
  )
  return { stream, agentRunId }
}
