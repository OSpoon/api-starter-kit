import {
  type ApiKeyAuth,
  type AuthContext,
  type AuthResult,
  createModels,
  createProvider,
  type Model,
  type Provider,
} from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'

import { readRuntimeLlmConfiguration } from '#services/llm_configuration_service'
import { resolveModelsDevPricing } from '#services/models_dev_pricing_service'

export async function getPiRuntimeConfiguration() {
  return readRuntimeLlmConfiguration()
}

async function createAuth(): Promise<ApiKeyAuth> {
  return {
    name: 'AI OpenAI-compatible API key',
    async resolve(input): Promise<AuthResult | undefined> {
      const config = await getPiRuntimeConfiguration()
      const key = input.credential?.key ?? config.chat.apiKey
      const baseUrl = config.chat.baseURL
      if (!key && !baseUrl) return undefined
      return {
        auth: {
          ...(key ? { apiKey: key } : {}),
          ...(baseUrl ? { baseUrl } : {}),
        },
      }
    },
  }
}

function createAuthContext(): AuthContext {
  return {
    async env(_name: string) {
      return undefined
    },
    async fileExists() {
      return false
    },
  }
}

async function createModel(): Promise<Model<'openai-completions'>> {
  const config = await getPiRuntimeConfiguration()
  const modelName = config.chat.model
  const baseUrl = config.chat.baseURL ?? 'https://api.openai.com/v1'
  const pricing = await resolveModelsDevPricing(modelName, baseUrl)
  return {
    id: modelName,
    name: modelName,
    api: 'openai-completions',
    provider: 'api-starter-openai',
    baseUrl,
    reasoning: config.chat.reasoningLevel !== 'off',
    input: ['text'],
    cost: pricing?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: config.chat.contextWindow,
    maxTokens: config.chat.maxTokens,
  }
}

async function createProviderInstance(): Promise<Provider<'openai-completions'>> {
  const config = await getPiRuntimeConfiguration()
  return createProvider({
    id: 'api-starter-openai',
    name: 'API Starter OpenAI-compatible provider',
    baseUrl: config.chat.baseURL ?? 'https://api.openai.com/v1',
    auth: { apiKey: await createAuth() },
    models: [await createModel()],
    api: openAICompletionsApi(),
  })
}

export async function createPiModels() {
  const models = createModels({ authContext: createAuthContext() })
  models.setProvider(await createProviderInstance())
  return models
}
