import {
  Agent,
  type AgentLoopTurnUpdate,
  type AgentMessage,
  type AgentTool,
  compact,
  DEFAULT_COMPACTION_SETTINGS,
  type Entry,
  estimateContextTokens,
  estimateTokens,
  prepareCompaction,
  type PrepareNextTurnContext,
  shouldCompact,
  type ShouldStopAfterTurnContext,
} from '@earendil-works/pi-agent-core'
import {
  type ApiKeyAuth,
  type AuthContext,
  type AuthResult,
  createModels,
  createProvider,
  type Message,
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

function convertPiMessages(messages: AgentMessage[]): Message[] {
  return messages.filter(
    (message): message is Message =>
      message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult'
  )
}

export function trimPiContextToTokenBudget(messages: AgentMessage[], tokenBudget: number) {
  if (estimateContextTokens(messages).tokens <= tokenBudget) return messages

  const retained: AgentMessage[] = []
  let tokens = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const messageTokens = estimateTokens(message)
    if (retained.length > 0 && tokens + messageTokens > tokenBudget) break
    retained.push(message)
    tokens += messageTokens
  }
  const recentMessages = retained.reverse()
  const firstUserMessage = recentMessages.findIndex((message) => message.role === 'user')
  return firstUserMessage > 0 ? recentMessages.slice(firstUserMessage) : recentMessages
}

function toCompactionEntries(messages: AgentMessage[]): Entry[] {
  return messages.map((message, index) => ({
    type: 'message',
    id: `ai-chat-message-${index}`,
    seq: index,
    parentId: index === 0 ? null : `ai-chat-message-${index - 1}`,
    timestamp: message.timestamp,
    message,
  }))
}

function isTerminalToolResult(result: unknown) {
  if (!result || typeof result !== 'object') return false
  const details = 'details' in result ? (result as { details?: unknown }).details : result
  if (!details || typeof details !== 'object') return false
  const kind = (details as { kind?: unknown }).kind
  return kind === 'confirmation' || kind === 'action_error' || kind === 'query_error'
}

export function shouldStopPiAfterTurn(
  input: Pick<ShouldStopAfterTurnContext, 'message' | 'toolResults'>
) {
  if (input.message.stopReason === 'error' || input.message.stopReason === 'aborted') return true
  return (
    input.toolResults.length > 0 &&
    input.toolResults.every((result) => isTerminalToolResult(result))
  )
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
  sessionId?: string
  signal?: AbortSignal
  refreshContext?: (context: PrepareNextTurnContext) => Promise<string | undefined>
  onCompaction?: (summary: string) => Promise<void>
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
    toolExecution: 'parallel',
    steeringMode: 'one-at-a-time',
    followUpMode: 'one-at-a-time',
    sessionId: input.sessionId,
    convertToLlm: convertPiMessages,
    transformContext: async (messages, signal) => {
      const tokenBudget = Math.max(model.contextWindow - model.maxTokens, 1)
      const settings = {
        ...DEFAULT_COMPACTION_SETTINGS,
        enabled: env.get('AI_CONTEXT_COMPRESSION_ENABLED') ?? true,
        reserveTokens: model.maxTokens,
        keepRecentTokens: Math.max(
          tokenBudget - (env.get('AI_CONTEXT_COMPRESSION_THRESHOLD_TOKENS') ?? 6000),
          1
        ),
      }
      if (shouldCompact(estimateContextTokens(messages).tokens, tokenBudget, settings)) {
        const preparation = prepareCompaction(toCompactionEntries(messages), settings)
        if (preparation.ok && preparation.value) {
          const result = await compact(
            preparation.value,
            models,
            model,
            '保留用户目标、已确认事实、工具结果和未完成事项。',
            signal
          )
          if (result.ok) {
            await input.onCompaction?.(result.value.summary)
            const summaryMessage: AgentMessage = {
              role: 'user',
              content: `<conversation-summary>\n${result.value.summary}\n</conversation-summary>`,
              timestamp: Date.now(),
            }
            return [summaryMessage, ...result.value.retainedTail]
          }
        }
      }
      return trimPiContextToTokenBudget(messages, tokenBudget)
    },
    shouldStopAfterTurn: shouldStopPiAfterTurn,
    prepareNextTurnWithContext: async (
      context,
      signal
    ): Promise<AgentLoopTurnUpdate | undefined> => {
      if (signal?.aborted || !input.refreshContext) return undefined
      const systemPrompt = await input.refreshContext(context)
      return systemPrompt ? { context: { ...context.context, systemPrompt } } : undefined
    },
    beforeToolCall: async ({ args }) => {
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        return { block: true, terminate: true, reason: '工具参数必须是对象' }
      }
      return undefined
    },
    afterToolCall: async ({ result, isError }) => ({
      isError,
      terminate: isError || result.terminate === true,
    }),
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
