import logger from '@adonisjs/core/services/logger'
import { ChatOpenAI } from '@langchain/openai'
import {
  type AnyAgentMiddleware,
  createMiddleware,
  modelCallLimitMiddleware,
  summarizationMiddleware,
  toolCallLimitMiddleware,
} from 'langchain'
import { z } from 'zod'

import { aiAgentSummaryPrompt } from '#services/ai_agent_prompt_policy'
import env from '#start/env'

export function getAiAgentModelName() {
  return env.get('AI_OPENAI_MODEL') ?? 'gpt-4o-mini'
}

function getTemperature() {
  return /qwen/i.test(getAiAgentModelName()) ? 0.1 : 0.3
}

export function getAiAgentSummarizationOptions() {
  return {
    enabled: env.get('AI_CONTEXT_COMPRESSION_ENABLED') ?? true,
    thresholdTokens: env.get('AI_CONTEXT_COMPRESSION_THRESHOLD_TOKENS') ?? 6000,
    recentMessageCount: env.get('AI_CONTEXT_COMPRESSION_RECENT_MESSAGES') ?? 8,
  }
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

function hasPersistedSummary(messages: Array<{ content?: unknown }>) {
  return messages.some(
    (message) =>
      typeof message.content === 'string' &&
      message.content.startsWith('Persisted conversation summary:')
  )
}

function getSummaryCandidateBoundaryId(messages: Array<{ additional_kwargs?: unknown }>) {
  const message = messages.find((item) => {
    const additional = item.additional_kwargs
    return (
      additional && typeof additional === 'object' && 'aiSummaryCandidateBoundaryId' in additional
    )
  })
  const value =
    message &&
    typeof message.additional_kwargs === 'object' &&
    message.additional_kwargs !== null &&
    'aiSummaryCandidateBoundaryId' in message.additional_kwargs
      ? message.additional_kwargs.aiSummaryCandidateBoundaryId
      : undefined
  return typeof value === 'number' && value > 0 ? value : undefined
}

export function createAiAgentMiddleware(): AnyAgentMiddleware[] {
  const summarization = getAiAgentSummarizationOptions()
  return [
    createMiddleware({
      name: 'ai_agent_run_state',
      stateSchema: z.object({
        aiRunStage: z.enum(['running', 'model_running', 'tool_pending', 'completed']).optional(),
      }),
      beforeAgent: () => ({ aiRunStage: 'running' as const }),
      beforeModel: () => ({ aiRunStage: 'model_running' as const }),
      afterModel: (state) => {
        const lastMessage = state.messages.at(-1)
        const hasToolCalls =
          lastMessage &&
          'tool_calls' in lastMessage &&
          Array.isArray(lastMessage.tool_calls) &&
          lastMessage.tool_calls.length > 0
        return { aiRunStage: hasToolCalls ? ('tool_pending' as const) : ('running' as const) }
      },
      afterAgent: () => ({ aiRunStage: 'completed' as const }),
    }),
    ...(summarization.enabled
      ? [
          safeSummarizationMiddleware({
            model: createAiAgentModel(),
            trigger: { tokens: summarization.thresholdTokens },
            keep: { messages: summarization.recentMessageCount },
            summaryPrompt: aiAgentSummaryPrompt,
            summaryPrefix: 'Persisted conversation summary:',
          }),
          createMiddleware({
            name: 'ai_agent_summary_boundary',
            stateSchema: z.object({
              aiSummaryCoveredThroughMessageId: z.number().positive().optional(),
            }),
            beforeModel: (state) => {
              const candidateBoundaryId = getSummaryCandidateBoundaryId(state.messages)
              return candidateBoundaryId && hasPersistedSummary(state.messages)
                ? {
                    aiSummaryCoveredThroughMessageId: candidateBoundaryId,
                  }
                : undefined
            },
          }),
        ]
      : []),
    modelCallLimitMiddleware({ runLimit: 6, exitBehavior: 'end' }),
    toolCallLimitMiddleware({ runLimit: 10, exitBehavior: 'continue' }),
  ]
}
