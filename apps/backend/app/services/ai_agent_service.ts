import crypto from 'node:crypto'

import logger from '@adonisjs/core/services/logger'
import { ChatOpenAI } from '@langchain/openai'
import {
  AIMessage,
  type AnyAgentMiddleware,
  createAgent,
  HumanMessage,
  modelCallLimitMiddleware,
  summarizationMiddleware,
  SystemMessage,
  toolCallLimitMiddleware,
} from 'langchain'

import type { AiChatCitation } from '#models/ai_chat_message'
import {
  getAiAgentCheckpointConfig,
  getAiAgentCheckpointer,
  hasAiAgentCheckpoint,
} from '#services/ai_agent_checkpoint'
import {
  type AiAgentPageContext,
  aiAgentSummaryPrompt,
  buildAiAgentSystemPrompt,
} from '#services/ai_agent_prompt_policy'
import { getPendingAiQueryContext } from '#services/ai_agent_query_registry'
import { createAiAgentTools } from '#services/ai_agent_registry'
import { createLangfuseCallback } from '#services/langfuse'
import env from '#start/env'

export type { AiAgentPageContext } from '#services/ai_agent_prompt_policy'

export interface AiAgentMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export function getAiAgentModelName() {
  return env.get('AI_OPENAI_MODEL') ?? 'gpt-4o-mini'
}

function getTemperature() {
  const defaultTemperature = /qwen/i.test(getAiAgentModelName()) ? 0.1 : 0.3
  return defaultTemperature
}

export function getAiAgentSummarizationOptions() {
  return {
    enabled: env.get('AI_CONTEXT_COMPRESSION_ENABLED') ?? true,
    thresholdTokens: env.get('AI_CONTEXT_COMPRESSION_THRESHOLD_TOKENS') ?? 6000,
    recentMessageCount: env.get('AI_CONTEXT_COMPRESSION_RECENT_MESSAGES') ?? 8,
  }
}

export function createAiAgentSystemPrompt(context?: AiAgentPageContext, liveSessionContext = '') {
  const configuredPrompt =
    env.get('AI_SYSTEM_PROMPT')?.trim() || 'You are an admin-console assistant.'

  return buildAiAgentSystemPrompt({
    identity: configuredPrompt,
    context,
    liveSessionContext,
  })
}

export function getAiRequestTimeout() {
  return Math.min(Math.max(env.get('AI_REQUEST_TIMEOUT_MS') ?? 180_000, 5_000), 300_000)
}

export function createAiAgentModel() {
  return new ChatOpenAI({
    apiKey: env.get('AI_OPENAI_API_KEY') || 'no-key',
    configuration: {
      baseURL: env.get('AI_OPENAI_BASE_URL')?.replace(/\/+$/, ''),
    },
    model: getAiAgentModelName(),
    temperature: getTemperature(),
    timeout: getAiRequestTimeout(),
    maxRetries: 2,
  })
}

function safeSummarizationMiddleware(
  options: Parameters<typeof summarizationMiddleware>[0]
): AnyAgentMiddleware {
  const middleware = summarizationMiddleware(options)

  return {
    ...middleware,
    beforeModel: async (state, runtime) => {
      try {
        const hook = middleware.beforeModel
        if (!hook) return undefined
        const handler = typeof hook === 'function' ? hook : hook.hook
        type HandlerRuntime = Parameters<typeof handler>[1]
        return await handler(state, runtime as HandlerRuntime)
      } catch (error) {
        logger.error({ err: error }, 'Context summarization failed; skipping compression')
        return undefined
      }
    },
  }
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
  const summarization = getAiAgentSummarizationOptions()
  const middleware: AnyAgentMiddleware[] = [
    ...(summarization.enabled
      ? [
          safeSummarizationMiddleware({
            model: createAiAgentModel(),
            trigger: { tokens: summarization.thresholdTokens },
            keep: { messages: summarization.recentMessageCount },
            summaryPrompt: aiAgentSummaryPrompt,
            summaryPrefix: 'Persisted conversation summary:',
          }),
        ]
      : []),
    // Native LangChain safeguards for one user-message -> agent-response run.
    modelCallLimitMiddleware({ runLimit: 6, exitBehavior: 'end' }),
    toolCallLimitMiddleware({ runLimit: 10, exitBehavior: 'continue' }),
  ]

  return createAgent({
    model,
    tools: createAiAgentTools(input),
    checkpointer: getAiAgentCheckpointer(),
    middleware,
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
