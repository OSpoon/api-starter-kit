import {
  Agent,
  type AgentLoopTurnUpdate,
  type AgentMessage,
  type AgentTool,
  type AgentTurnContext,
} from '@earendil-works/pi-agent-core'
import {
  type Api,
  type ApiKeyAuth,
  type AssistantMessageEventStream,
  type AuthContext,
  type AuthResult,
  createModels,
  createProvider,
  type Message,
  type Model,
  type Provider,
  type Usage,
} from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { estimateContextTokens, estimateMessageTokens } from '@earendil-works/pi-ai/utils/estimate'
import { getCurrentSystemMessage } from '@earendil-works/pi-ai/utils/transcript'
import type { TelemetrySpan } from '@earendil-works/pi-telemetry'

import {
  isAiAgentReadTool,
  isAiAgentTerminalToolResult,
  isRecoverableAiAgentReadToolError,
  maxConsecutiveAiAgentReadToolFailures,
} from '#ai/core/ai_agent_tool_errors'
import { aiAgentSummaryPrompt } from '#ai/policy/ai_agent_prompt_policy'
import { readRuntimeLlmConfiguration } from '#services/llm_configuration_service'
import { resolveModelsDevPricing } from '#services/models_dev_pricing_service'

/**
 * Pi runtime boundary for the backend AI assistant.
 *
 * The application owns credentials, authorization, persistence, and tool
 * execution. Pi only owns the model/tool loop and its typed event stream.
 */
export type PiAgentMessage = AgentMessage

export type PiModelUsage = {
  providerId: string
  modelId: string
  baseUrl: string
  usage: Usage
  status: 'completed' | 'failed'
}

function estimatePiMessages(messages: AgentMessage[]) {
  return estimateContextTokens(getPiContextMessages(messages)).tokens
}

function getPiContextMessages(messages: AgentMessage[]): Message[] {
  const convertedMessages = convertPiMessages(messages)
  const systemMessage = getCurrentSystemMessage(convertedMessages)
  return [
    ...(systemMessage ? [systemMessage] : []),
    ...convertedMessages.filter((message) => message.role !== 'system'),
  ]
}

function convertPiMessages(messages: AgentMessage[]): Message[] {
  return messages.filter(
    (message): message is Message =>
      message.role === 'system' ||
      message.role === 'user' ||
      message.role === 'assistant' ||
      message.role === 'toolResult'
  )
}

export function trimPiContextToTokenBudget(messages: AgentMessage[], tokenBudget: number) {
  if (estimatePiMessages(messages) <= tokenBudget) return messages

  const systemMessage = getCurrentSystemMessage(convertPiMessages(messages))
  const recentMessages = messages.filter((message) => message.role !== 'system')
  let tokens = systemMessage ? estimateMessageTokens(systemMessage) : 0
  let firstRetainedIndex = recentMessages.length
  while (firstRetainedIndex > 0) {
    const index = firstRetainedIndex - 1
    const message = recentMessages[index]
    const piMessage = convertPiMessages([message])[0]
    const messageTokens = piMessage ? estimateMessageTokens(piMessage) : 0
    if (firstRetainedIndex < recentMessages.length && tokens + messageTokens > tokenBudget) break
    firstRetainedIndex = index
    tokens += messageTokens
  }
  const latestUserIndex = recentMessages.findLastIndex((message) => message.role === 'user')
  if (latestUserIndex >= 0) firstRetainedIndex = Math.min(firstRetainedIndex, latestUserIndex)
  return [...(systemMessage ? [systemMessage] : []), ...recentMessages.slice(firstRetainedIndex)]
}

function getSummaryMessageText(message: Message) {
  if (typeof message.content === 'string') return message.content
  return message.content
    .map((part) => {
      if (part.type === 'text') return part.text
      if (part.type === 'toolCall') return `Tool call: ${part.name}`
      return '[image attachment]'
    })
    .filter(Boolean)
    .join('\n')
}

function formatMessagesForSummary(messages: AgentMessage[]) {
  return convertPiMessages(messages)
    .map((message) => `${message.role}: ${getSummaryMessageText(message)}`)
    .join('\n\n')
}

async function compactPiContext(input: {
  messages: AgentMessage[]
  models: ReturnType<typeof createModels>
  model: Model<Api>
  tokenBudget: number
  signal?: AbortSignal
  onCompaction?: (summary: string) => Promise<void>
  onUsage?: (usage: PiModelUsage) => void | Promise<void>
  getTelemetrySpan?: () => TelemetrySpan | undefined
}) {
  const allMessages = convertPiMessages(input.messages)
  const systemMessage = getCurrentSystemMessage(allMessages)
  const conversationalMessages = input.messages.filter((message) => message.role !== 'system')
  const systemTokens = systemMessage ? estimateMessageTokens(systemMessage) : 0
  const keepRecentTokens = Math.max(input.tokenBudget - systemTokens - 6000, 1)
  let firstRetainedIndex = conversationalMessages.length
  let retainedTokens = 0
  while (firstRetainedIndex > 0 && retainedTokens < keepRecentTokens) {
    const message = conversationalMessages[firstRetainedIndex - 1]
    const piMessage = convertPiMessages([message])[0]
    retainedTokens += piMessage ? estimateMessageTokens(piMessage) : 0
    firstRetainedIndex -= 1
  }
  const latestUserIndex = conversationalMessages.findLastIndex((message) => message.role === 'user')
  if (latestUserIndex >= 0) firstRetainedIndex = Math.min(firstRetainedIndex, latestUserIndex)

  const olderMessages = conversationalMessages.slice(0, firstRetainedIndex)
  if (olderMessages.length === 0) return undefined

  const telemetry = input.getTelemetrySpan?.()
  const summaryContext = {
    systemPrompt: aiAgentSummaryPrompt,
    messages: [
      {
        role: 'user' as const,
        content: formatMessagesForSummary(olderMessages),
        timestamp: Date.now(),
      },
    ],
  }
  const response = telemetry
    ? await telemetry.startSpan(
        {
          name: 'api-starter.ai.model_call',
          attributes: {
            'langfuse.observation.type': 'generation',
            'langfuse.observation.model.name': input.model.id,
            'langfuse.observation.input': JSON.stringify(summaryContext.messages),
          },
        },
        async (span) => {
          const result = await input.models.completeSimple(input.model, summaryContext, {
            signal: input.signal,
            telemetry: span,
          })
          span.setAttributes({
            'langfuse.observation.output': JSON.stringify(result.content),
            'usage.input': result.usage.input,
            'usage.output': result.usage.output,
            'usage.cache_read': result.usage.cacheRead,
            'usage.cache_write': result.usage.cacheWrite,
            'cost.total': result.usage.cost.total,
            'app.ai.stop_reason': result.stopReason,
          })
          if (result.stopReason === 'error') {
            span.setStatus({
              status: 'error',
              error: { name: 'ProviderError', message: result.errorMessage ?? 'AI provider error' },
            })
          }
          return result
        }
      )
    : await input.models.completeSimple(input.model, summaryContext, { signal: input.signal })
  await input.onUsage?.({
    providerId: input.model.provider,
    modelId: input.model.id,
    baseUrl: input.model.baseUrl,
    usage: response.usage,
    status:
      response.stopReason === 'error' || response.stopReason === 'aborted' ? 'failed' : 'completed',
  })
  const summary = response.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim()
  if (response.stopReason !== 'stop' || !summary) return undefined

  await input.onCompaction?.(summary)
  const summaryMessage: AgentMessage = {
    role: 'user',
    content: `<conversation-summary>\n${summary}\n</conversation-summary>`,
    timestamp: Date.now(),
  }
  return [
    ...(systemMessage ? [systemMessage] : []),
    summaryMessage,
    ...conversationalMessages.slice(firstRetainedIndex),
  ]
}

function isTerminalToolResult(result: unknown) {
  if (!result || typeof result !== 'object') return false
  const details = 'details' in result ? (result as { details?: unknown }).details : result
  const toolName = 'toolName' in result ? String((result as { toolName?: unknown }).toolName) : ''
  return isAiAgentTerminalToolResult(toolName, details)
}

function addToolTelemetry(
  tool: AgentTool,
  getTelemetrySpan: () => TelemetrySpan | undefined
): AgentTool {
  const instrumentedTool: AgentTool = {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const telemetry = getTelemetrySpan()
      if (!telemetry) return tool.execute(toolCallId, params, signal, onUpdate)

      return telemetry.startSpan(
        {
          name: 'api-starter.ai.tool',
          attributes: {
            'app.ai.tool.name': tool.name,
            'app.ai.tool.call_id': toolCallId,
          },
        },
        async (span) => {
          span.setAttributes({ 'langfuse.observation.input': JSON.stringify(params) })
          const result = await tool.execute(toolCallId, params, signal, onUpdate)
          span.setAttributes({ 'langfuse.observation.output': JSON.stringify(result) })
          if (result.isError) span.setStatus({ status: 'error' })
          return result
        }
      )
    },
  }
  return instrumentedTool
}

export function shouldStopPiAfterTurn(
  input: Pick<AgentTurnContext, 'message' | 'toolResults'>,
  hasQueuedMessages = false,
  readToolFailureLimitReached = false
) {
  if (input.message.stopReason === 'error' || input.message.stopReason === 'aborted') return true
  if (hasQueuedMessages) return false
  if (readToolFailureLimitReached) return true
  return (
    input.toolResults.length > 0 &&
    input.toolResults.every((result) => isTerminalToolResult(result))
  )
}

async function getRuntimeConfig() {
  return readRuntimeLlmConfiguration()
}

async function createAuth(): Promise<ApiKeyAuth> {
  return {
    name: 'AI OpenAI-compatible API key',
    async resolve(input): Promise<AuthResult | undefined> {
      const config = await getRuntimeConfig()
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
  const config = await getRuntimeConfig()
  const modelName = config.chat.model
  const baseUrl = config.chat.baseURL ?? 'https://api.openai.com/v1'
  const pricing = await resolveModelsDevPricing(modelName, baseUrl)
  return {
    id: modelName,
    name: modelName,
    api: 'openai-completions',
    provider: 'api-starter-openai',
    baseUrl,
    reasoning: /qwen|deepseek|reason/i.test(modelName),
    input: ['text'],
    cost: pricing?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: config.chat.contextWindow,
    maxTokens: config.chat.maxTokens,
  }
}

async function createProviderInstance(): Promise<Provider<'openai-completions'>> {
  const config = await getRuntimeConfig()
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

export async function createPiAgent(input: {
  systemPrompt: string
  tools: AgentTool[]
  messages?: PiAgentMessage[]
  sessionId?: string
  signal?: AbortSignal
  initialRuntimeContext?: string
  refreshRuntimeContext?: () => Promise<string | undefined>
  onCompaction?: (summary: string) => Promise<void>
  onCompactionUsage?: (usage: PiModelUsage) => void | Promise<void>
  getTelemetrySpan?: () => TelemetrySpan | undefined
}) {
  const models = await createPiModels()
  const runtimeConfig = await getRuntimeConfig()
  const modelName = runtimeConfig.chat.model
  const model = models.getModel('api-starter-openai', modelName)
  if (!model) throw new Error(`Pi model is not configured: ${modelName}`)

  let hasQueuedMessages = () => false
  let consecutiveReadToolFailures = 0
  const getTelemetrySpan = input.getTelemetrySpan ?? (() => undefined)
  const tools = input.tools.map((tool) => addToolTelemetry(tool, getTelemetrySpan))
  const agent = new Agent({
    initialState: {
      systemPrompt: input.systemPrompt,
      model,
      tools,
      messages: [
        {
          role: 'system',
          content: input.systemPrompt,
          sections: { runtime_context: input.initialRuntimeContext ?? '' },
          timestamp: Date.now(),
        },
        ...(input.messages ?? []),
      ],
      thinkingLevel: 'off',
    },
    streamFn: (requestModel, context, options) => {
      const telemetry = input.getTelemetrySpan?.()
      if (!telemetry) return models.streamSimple(requestModel, context, options)

      return new Promise<AssistantMessageEventStream>((resolve, reject) => {
        void telemetry
          .startSpan(
            {
              name: 'api-starter.ai.model_call',
              attributes: {
                'langfuse.observation.type': 'generation',
                'langfuse.observation.model.name': requestModel.id,
                'langfuse.observation.input': JSON.stringify(context.messages),
              },
            },
            async (span) => {
              const stream = models.streamSimple(requestModel, context, {
                ...options,
                telemetry: span,
              })
              resolve(stream)
              const response = await stream.result()
              span.setAttributes({
                'langfuse.observation.output': JSON.stringify(response.content),
                'usage.input': response.usage.input,
                'usage.output': response.usage.output,
                'usage.cache_read': response.usage.cacheRead,
                'usage.cache_write': response.usage.cacheWrite,
                'cost.total': response.usage.cost.total,
                'app.ai.stop_reason': response.stopReason,
              })
              if (response.stopReason === 'error') {
                span.setStatus({
                  status: 'error',
                  error: {
                    name: 'ProviderError',
                    message: response.errorMessage ?? 'AI provider error',
                  },
                })
              }
            }
          )
          .catch(reject)
      })
    },
    toolExecution: 'sequential',
    steeringMode: 'one-at-a-time',
    followUpMode: 'one-at-a-time',
    sessionId: input.sessionId,
    convertToLlm: getPiContextMessages,
    transformContext: async (messages, signal) => {
      const tokenBudget = Math.max(model.contextWindow - model.maxTokens, 1)
      if (estimatePiMessages(messages) > tokenBudget) {
        try {
          const compactedMessages = await compactPiContext({
            messages,
            models,
            model,
            tokenBudget,
            signal,
            onCompaction: input.onCompaction,
            onUsage: input.onCompactionUsage,
            getTelemetrySpan: input.getTelemetrySpan,
          })
          if (compactedMessages) return compactedMessages
        } catch {
          // Context trimming below keeps a failed summary request from aborting the chat turn.
        }
      }
      return trimPiContextToTokenBudget(messages, tokenBudget)
    },
    finishTurn: (context) =>
      shouldStopPiAfterTurn(
        context,
        hasQueuedMessages(),
        consecutiveReadToolFailures >= maxConsecutiveAiAgentReadToolFailures
      )
        ? { action: 'end' }
        : undefined,
    prepareNextTurnWithContext: async (
      _context,
      signal
    ): Promise<AgentLoopTurnUpdate | undefined> => {
      if (signal?.aborted || !input.refreshRuntimeContext) return undefined
      const runtimeContext = await input.refreshRuntimeContext()
      return runtimeContext === undefined
        ? undefined
        : {
            messages: [
              {
                role: 'system',
                content: '',
                sections: { runtime_context: runtimeContext },
                timestamp: Date.now(),
              },
            ],
          }
    },
    beforeToolCall: async ({ args }) => {
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        return { block: true, terminate: true, reason: '工具参数必须是对象' }
      }
      return undefined
    },
    afterToolCall: async ({ result, isError, toolCall }) => {
      const isReadFailure = isRecoverableAiAgentReadToolError(toolCall.name, result.details)
      if (isReadFailure) consecutiveReadToolFailures += 1
      else if (isAiAgentReadTool(toolCall.name)) consecutiveReadToolFailures = 0

      return {
        isError,
        terminate:
          isError ||
          result.terminate === true ||
          isAiAgentTerminalToolResult(toolCall.name, result.details) ||
          consecutiveReadToolFailures >= maxConsecutiveAiAgentReadToolFailures,
      }
    },
  })
  hasQueuedMessages = () => agent.hasQueuedMessages()

  if (input.signal) {
    if (input.signal.aborted) agent.abort()
    else input.signal.addEventListener('abort', () => agent.abort(), { once: true })
  }

  return { agent, models, model }
}
