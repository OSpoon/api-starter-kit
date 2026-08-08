import crypto from 'node:crypto'

import { AIMessage, createAgent, HumanMessage, SystemMessage } from 'langchain'

import type { AiChatCitation } from '#models/ai_chat_message'
import {
  getAiAgentCheckpointConfig,
  getAiAgentCheckpointer,
  hasAiAgentCheckpoint,
} from '#services/ai_agent_checkpoint'
import {
  type AiAgentPageContext,
  createAiAgentSystemPrompt,
} from '#services/ai_agent_prompt_policy'
import { getPendingAiQueryContext } from '#services/ai_agent_query_registry'
import { createAiAgentTools } from '#services/ai_agent_registry'
import { createAiAgentMiddleware, createAiAgentModel } from '#services/ai_agent_runtime'
import { createLangfuseCallback } from '#services/langfuse'

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

export interface AiAgentMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

function createAiAgent(input: {
  userId: number
  conversationId: number
  agentRunId: string
  context?: AiAgentPageContext
  liveSessionContext?: string
  signal?: AbortSignal
  onKnowledgeSources?: (sources: AiChatCitation[]) => void
}) {
  const model = createAiAgentModel()

  return createAgent({
    model,
    tools: createAiAgentTools(input),
    checkpointer: getAiAgentCheckpointer(),
    middleware: createAiAgentMiddleware(),
    systemPrompt: createAiAgentSystemPrompt(input.context, input.liveSessionContext),
  })
}

async function buildLiveSessionContext(conversationId: number, userId: number) {
  try {
    const pendingQueryContext = await getPendingAiQueryContext({ conversationId, userId })
    return `${pendingQueryContext}`
  } catch {
    return ''
  }
}

export function selectAiAgentInvocationMessages(input: {
  messages: AiAgentMessage[]
  hasCheckpoint: boolean
}) {
  if (!input.hasCheckpoint) return input.messages
  const latestMessage = input.messages.at(-1)
  if (!latestMessage) throw new Error('AI agent invocation is missing a user message')
  return [latestMessage]
}

export async function createAiAgentStream(input: {
  conversationId: number
  userId: number
  messages: AiAgentMessage[]
  context?: AiAgentPageContext
  signal?: AbortSignal
  onKnowledgeSources?: (sources: AiChatCitation[]) => void
}) {
  const agentRunId = crypto.randomUUID()
  const langfuseCallback = createLangfuseCallback({
    userId: input.userId,
    conversationId: input.conversationId,
    agentRunId,
  })
  const liveSessionContext = await buildLiveSessionContext(input.conversationId, input.userId)
  const checkpointInput = { conversationId: input.conversationId, userId: input.userId }
  const messages = selectAiAgentInvocationMessages({
    messages: input.messages,
    hasCheckpoint: await hasAiAgentCheckpoint(checkpointInput),
  })
  const agent = createAiAgent({
    ...input,
    agentRunId,
    liveSessionContext,
  })

  const stream = await agent.streamEvents(
    {
      messages: messages.map((message) => {
        switch (message.role) {
          case 'user':
            return new HumanMessage({ content: message.content })
          case 'assistant':
            return new AIMessage({ content: message.content })
          case 'system':
            return new SystemMessage({ content: message.content })
        }
      }),
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
