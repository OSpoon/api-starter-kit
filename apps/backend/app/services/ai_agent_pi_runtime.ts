import { Agent, type AgentMessage, type AgentTool } from '@earendil-works/pi-agent-core'
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

import env from '#start/env'

/**
 * Pi runtime boundary for the backend AI assistant.
 *
 * The application owns credentials, authorization, persistence, and tool
 * execution. Pi only owns the model/tool loop and its typed event stream.
 */
export type PiAgentMessage = AgentMessage
function toolResultText(result: unknown) {
  if (!result || typeof result !== 'object') return ''
  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      (part): part is { type: 'text'; text: string } =>
        Boolean(part) &&
        typeof part === 'object' &&
        (part as { type?: unknown }).type === 'text' &&
        typeof (part as { text?: unknown }).text === 'string'
    )
    .map((part) => part.text)
    .join('')
}

/**
 * Stop after terminal tool results. Without this guard, small models often
 * retry a proposal after receiving its confirmation/error payload and can
 * enter an unbounded tool-call loop.
 */
export function shouldStopAfterPiToolTurn(toolResults: unknown[]) {
  return toolResults.some((result) => {
    if (!result || typeof result !== 'object') return false
    if ((result as { isError?: unknown }).isError === true) return true
    const text = toolResultText(result)
    if (!text) return false
    try {
      const parsed = JSON.parse(text) as { kind?: unknown }
      return (
        parsed.kind === 'confirmation' ||
        parsed.kind === 'action_error' ||
        parsed.kind === 'query_error'
      )
    } catch {
      return false
    }
  })
}

function getModelName() {
  return env.get('AI_OPENAI_MODEL') ?? 'gpt-4o-mini'
}

function getBaseUrl() {
  return env.get('AI_OPENAI_BASE_URL')?.replace(/\/+$/, '') ?? 'https://api.openai.com/v1'
}

function createAuth(): ApiKeyAuth {
  return {
    name: 'AI OpenAI-compatible API key',
    async resolve(input): Promise<AuthResult | undefined> {
      const key = input.credential?.key ?? (await input.ctx.env('AI_OPENAI_API_KEY'))
      const baseUrl = await input.ctx.env('AI_OPENAI_BASE_URL')
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
    async env(name: string) {
      if (name === 'AI_OPENAI_API_KEY') return env.get('AI_OPENAI_API_KEY')
      if (name === 'AI_OPENAI_BASE_URL') return env.get('AI_OPENAI_BASE_URL')
      return undefined
    },
    async fileExists() {
      return false
    },
  }
}

function createModel(): Model<'openai-completions'> {
  return {
    id: getModelName(),
    name: getModelName(),
    api: 'openai-completions',
    provider: 'api-starter-openai',
    baseUrl: getBaseUrl(),
    reasoning: /qwen|deepseek|reason/i.test(getModelName()),
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384,
  }
}

function createProviderInstance(): Provider<'openai-completions'> {
  return createProvider({
    id: 'api-starter-openai',
    name: 'API Starter OpenAI-compatible provider',
    baseUrl: getBaseUrl(),
    auth: { apiKey: createAuth() },
    models: [createModel()],
    api: openAICompletionsApi(),
  })
}

export function createPiModels() {
  const models = createModels({ authContext: createAuthContext() })
  models.setProvider(createProviderInstance())
  return models
}

export function createPiAgent(input: {
  systemPrompt: string
  tools: AgentTool[]
  messages?: PiAgentMessage[]
  signal?: AbortSignal
}) {
  const models = createPiModels()
  const model = models.getModel('api-starter-openai', getModelName())
  if (!model) throw new Error(`Pi model is not configured: ${getModelName()}`)

  const agent = new Agent({
    initialState: {
      systemPrompt: input.systemPrompt,
      model,
      tools: input.tools,
      messages: input.messages ?? [],
      thinkingLevel: 'off',
    },
    streamFn: models.streamSimple.bind(models),
    transformContext: async (messages) => messages,
    toolExecution: 'sequential',
    shouldStopAfterTurn: ({ toolResults }) => shouldStopAfterPiToolTurn(toolResults),
  })

  if (input.signal) {
    if (input.signal.aborted) agent.abort()
    else input.signal.addEventListener('abort', () => agent.abort(), { once: true })
  }

  return { agent, models, model }
}

export function getPiAgentModelName() {
  return getModelName()
}

export function getPiAgentBaseUrl() {
  return getBaseUrl()
}
