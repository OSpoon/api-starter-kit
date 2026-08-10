import { AIMessage, createAgent, HumanMessage, SystemMessage } from 'langchain'

import { type getAiAgentCheckpointer } from '#services/ai_agent_checkpoint'
import {
  type AiAgentPageContext,
  createAiAgentSystemPrompt,
} from '#services/ai_agent_prompt_policy'
import { createAiAgentMiddleware, createAiAgentModel } from '#services/ai_agent_runtime'
import type { AiAgentToolContext } from '#services/ai_agent_tool_context'
import { createAiAgentTools } from '#services/ai_agent_tool_registry'

export interface AiAgentGraphMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  id?: number
  summaryCandidateBoundaryId?: number
}

export function createAiAgentGraph(
  input: AiAgentToolContext & {
    context?: AiAgentPageContext
    liveSessionContext?: string
    checkpointer?: ReturnType<typeof getAiAgentCheckpointer>
  }
) {
  const agent = createAgent({
    model: createAiAgentModel(),
    tools: createAiAgentTools(input),
    checkpointer: input.checkpointer,
    middleware: createAiAgentMiddleware(),
    systemPrompt: createAiAgentSystemPrompt(input.context, input.liveSessionContext),
  })

  return {
    agent,
    graph: agent.graph,
  }
}

export function toAiAgentGraphMessages(messages: AiAgentGraphMessage[]) {
  return messages.map((message) => {
    switch (message.role) {
      case 'user':
        return new HumanMessage({
          content: message.content,
          additional_kwargs:
            message.id || message.summaryCandidateBoundaryId
              ? {
                  ...(message.id ? { aiChatMessageId: message.id } : {}),
                  ...(message.summaryCandidateBoundaryId
                    ? { aiSummaryCandidateBoundaryId: message.summaryCandidateBoundaryId }
                    : {}),
                }
              : undefined,
        })
      case 'assistant':
        return new AIMessage({
          content: message.content,
          additional_kwargs: message.id ? { aiChatMessageId: message.id } : undefined,
        })
      case 'system':
        return new SystemMessage({
          content: message.content,
          additional_kwargs: message.id ? { aiChatMessageId: message.id } : undefined,
        })
    }
  })
}
