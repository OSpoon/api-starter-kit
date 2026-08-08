import logger from '@adonisjs/core/services/logger'
import { ChatOpenAI } from '@langchain/openai'
import {
  type AnyAgentMiddleware,
  modelCallLimitMiddleware,
  summarizationMiddleware,
  toolCallLimitMiddleware,
} from 'langchain'

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

export function createAiAgentMiddleware(): AnyAgentMiddleware[] {
  const summarization = getAiAgentSummarizationOptions()
  return [
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
    modelCallLimitMiddleware({ runLimit: 6, exitBehavior: 'end' }),
    toolCallLimitMiddleware({ runLimit: 10, exitBehavior: 'continue' }),
  ]
}
