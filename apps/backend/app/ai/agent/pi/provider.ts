import {
  type ApiKeyAuth,
  type AuthContext,
  type AuthResult,
  createModels,
  createProvider,
  type Model,
} from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'

import type { AgentModelConfig } from '../agent.js'

export async function createPiModels(config: AgentModelConfig) {
  const model: Model<'openai-completions'> = {
    id: config.modelId,
    name: config.modelId,
    api: 'openai-completions',
    provider: config.providerId,
    baseUrl: config.baseUrl,
    reasoning: config.reasoning,
    input: ['text', 'image'],
    cost: config.cost,
    contextWindow: config.contextWindow,
    maxTokens: config.maxTokens,
  }
  const auth: ApiKeyAuth = {
    name: 'AI OpenAI-compatible API key',
    async resolve(input): Promise<AuthResult | undefined> {
      const key = input.credential?.key ?? config.apiKey
      if (!key && !config.baseUrl) return undefined
      return {
        auth: {
          ...(key ? { apiKey: key } : {}),
          baseUrl: config.baseUrl,
        },
      }
    },
  }
  const authContext: AuthContext = {
    async env() {
      return undefined
    },
    async fileExists() {
      return false
    },
  }
  const models = createModels({ authContext })
  models.setProvider(
    createProvider({
      id: config.providerId,
      name: 'API Starter OpenAI-compatible provider',
      baseUrl: config.baseUrl,
      auth: { apiKey: auth },
      models: [model],
      api: openAICompletionsApi(),
    })
  )
  return models
}
