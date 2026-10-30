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

import { getAiAgentSummarizationOptions } from '#ai/core/ai_agent_config'
import type { AiAgentConfirmationSummary } from '#ai/core/ai_agent_confirmation'
import {
  isAiAgentReadTool,
  isAiAgentTerminalToolResult,
  isRecoverableAiAgentReadToolError,
  maxConsecutiveAiAgentReadToolFailures,
} from '#ai/core/ai_agent_tool_errors'
import { aiAgentSummaryPrompt } from '#ai/policy/ai_agent_prompt_policy'
import type { AiAgentToolWithConfirmation } from '#ai/registry/ai_agent_tool_helpers'
import { readRuntimeLlmConfiguration } from '#services/llm_configuration_service'
import { resolveModelsDevPricing } from '#services/models_dev_pricing_service'

/**
 * Pi runtime boundary for the backend AI assistant.
 *
 * The application owns credentials, authorization, persistence, and tool
 * execution. Pi only owns the model/tool loop and its typed event stream.
 */
export type PiAgentMessage = AgentMessage & {
  sourceMessageId?: number
  isContextSummary?: boolean
}

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
  return messages
    .filter(
      (message) =>
        message.role === 'system' ||
        message.role === 'user' ||
        message.role === 'assistant' ||
        message.role === 'toolResult'
    )
    .map((message) => {
      const converted = { ...message } as PiAgentMessage
      delete converted.sourceMessageId
      delete converted.isContextSummary
      return converted as Message
    })
}

export function trimPiContextToTokenBudget(messages: AgentMessage[], tokenBudget: number) {
  if (estimatePiMessages(messages) <= tokenBudget) return messages

  const systemMessage = getCurrentSystemMessage(convertPiMessages(messages))
  const recentMessages = messages.filter((message) => message.role !== 'system')
  let tokens = systemMessage ? estimateMessageTokens(systemMessage) : 0
  const latestUserIndex = recentMessages.findLastIndex((message) => message.role === 'user')

  if (latestUserIndex >= 0) {
    const laterMessages: AgentMessage[] = []
    const latestUserMessage = recentMessages[latestUserIndex]
    const minimumUserTokens = estimateMessageTokens({
      role: 'user',
      content: '…',
      timestamp: 0,
    })
    for (let index = recentMessages.length - 1; index > latestUserIndex; index -= 1) {
      const message = recentMessages[index]
      const piMessage = convertPiMessages([message])[0]
      const messageTokens = piMessage ? estimateMessageTokens(piMessage) : 0
      if (tokens + messageTokens + minimumUserTokens > tokenBudget) break
      laterMessages.unshift(message)
      tokens += messageTokens
    }
    const piUserMessage = convertPiMessages([latestUserMessage])[0]
    const availableTokens = Math.max(tokenBudget - tokens, 0)
    const boundedUserMessage = piUserMessage
      ? estimateMessageTokens(piUserMessage) > availableTokens
        ? truncateUserMessageToTokenBudget(latestUserMessage, availableTokens)
        : latestUserMessage
      : undefined
    return [
      ...(systemMessage ? [systemMessage] : []),
      ...(boundedUserMessage ? [boundedUserMessage] : []),
      ...laterMessages,
    ]
  }

  let firstRetainedIndex = recentMessages.length
  while (firstRetainedIndex > 0) {
    const message = recentMessages[firstRetainedIndex - 1]
    const piMessage = convertPiMessages([message])[0]
    const messageTokens = piMessage ? estimateMessageTokens(piMessage) : 0
    if (tokens + messageTokens > tokenBudget) break
    firstRetainedIndex -= 1
    tokens += messageTokens
  }
  return [...(systemMessage ? [systemMessage] : []), ...recentMessages.slice(firstRetainedIndex)]
}

function truncateUserMessageToTokenBudget(message: AgentMessage, tokenBudget: number) {
  if (message.role !== 'user' || typeof message.content !== 'string') return undefined
  let low = 0
  let high = message.content.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    const candidate = { ...message, content: `${message.content.slice(0, middle)}…` }
    const piCandidate = convertPiMessages([candidate])[0]
    if (piCandidate && estimateMessageTokens(piCandidate) <= tokenBudget) low = middle
    else high = middle - 1
  }
  if (tokenBudget < estimateMessageTokens({ role: 'user', content: '…', timestamp: 0 })) {
    return undefined
  }
  return { ...message, content: `${message.content.slice(0, low)}…` }
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

function isContextSummaryMessage(message: AgentMessage): message is PiAgentMessage {
  return 'isContextSummary' in message && message.isContextSummary === true
}

function getSourceMessageId(message: AgentMessage) {
  return 'sourceMessageId' in message && typeof message.sourceMessageId === 'number'
    ? message.sourceMessageId
    : undefined
}

function truncateTextToTokenBudget(content: string, tokenBudget: number) {
  const fits = (text: string) =>
    estimateMessageTokens({ role: 'user', content: text, timestamp: 0 }) <= tokenBudget
  if (fits(content)) return content

  let low = 0
  let high = content.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (fits(`${content.slice(0, middle)}…`)) low = middle
    else high = middle - 1
  }
  return low > 0 ? `${content.slice(0, low)}…` : ''
}

export function buildAiAgentSummaryBatch(
  messages: AgentMessage[],
  previousSummary: string,
  maxInputTokens: number
) {
  const summaryBudget = Math.max(Math.floor(maxInputTokens / 2), 0)
  const boundedPreviousSummary = truncateTextToTokenBudget(previousSummary, summaryBudget)
  const header = boundedPreviousSummary
    ? `Existing summary (untrusted):\n${boundedPreviousSummary}\n\nNew messages:\n`
    : 'New messages:\n'
  let content = header
  let includedCount = 0
  let coveredThroughMessageId: number | undefined
  const estimate = (value: string) =>
    estimateMessageTokens({ role: 'user', content: value, timestamp: 0 })

  for (const message of messages) {
    const text = `${message.role}: ${getSummaryMessageText(
      convertPiMessages([message])[0] ?? (message as Message)
    )}`
    const candidate = `${content}${text}\n\n`
    if (estimate(candidate) <= maxInputTokens) {
      content = candidate
      includedCount += 1
      coveredThroughMessageId = getSourceMessageId(message) ?? coveredThroughMessageId
      continue
    }

    if (includedCount === 0) {
      const availableTokens = Math.max(maxInputTokens - estimate(content), 0)
      const truncatedText = truncateTextToTokenBudget(text, availableTokens)
      if (truncatedText) {
        content = `${content}${truncatedText}`
        includedCount = 1
        coveredThroughMessageId = getSourceMessageId(message)
      }
    }
    break
  }

  return includedCount > 0 && estimate(content) <= maxInputTokens
    ? { content, coveredThroughMessageId }
    : undefined
}

async function compactPiContext(input: {
  messages: AgentMessage[]
  models: ReturnType<typeof createModels>
  model: Model<Api>
  tokenBudget: number
  previousSummary: string
  coveredThroughMessageId: number
  summaryInputTokenBudget: number
  summaryOutputTokenBudget: number
  signal?: AbortSignal
  onCompaction?: (summary: string, coveredThroughMessageId: number) => Promise<void>
  onUsage?: (usage: PiModelUsage) => void | Promise<void>
  getTelemetrySpan?: () => TelemetrySpan | undefined
}) {
  const allMessages = convertPiMessages(input.messages)
  const systemMessage = getCurrentSystemMessage(allMessages)
  const conversationalMessages = input.messages.filter(
    (message) => message.role !== 'system' && !isContextSummaryMessage(message)
  )
  const systemTokens = systemMessage ? estimateMessageTokens(systemMessage) : 0
  const keepRecentTokens = Math.max(
    input.tokenBudget - systemTokens - input.summaryOutputTokenBudget - 128,
    1
  )
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

  const olderMessages = conversationalMessages.slice(0, firstRetainedIndex).filter((message) => {
    const sourceMessageId = getSourceMessageId(message)
    return sourceMessageId === undefined || sourceMessageId > input.coveredThroughMessageId
  })
  const summaryBatch = buildAiAgentSummaryBatch(
    olderMessages,
    input.previousSummary,
    Math.min(
      input.summaryInputTokenBudget,
      Math.max(input.model.contextWindow - input.summaryOutputTokenBudget - 512, 128)
    )
  )
  if (!summaryBatch) return undefined

  const telemetry = input.getTelemetrySpan?.()
  const summaryContext = {
    systemPrompt: aiAgentSummaryPrompt,
    messages: [
      {
        role: 'user' as const,
        content: summaryBatch.content,
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
            maxTokens: input.summaryOutputTokenBudget,
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
    : await input.models.completeSimple(input.model, summaryContext, {
        signal: input.signal,
        maxTokens: input.summaryOutputTokenBudget,
      })
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
  if (!['stop', 'length'].includes(response.stopReason) || !summary) return undefined

  const coveredThroughMessageId = Math.max(
    input.coveredThroughMessageId,
    summaryBatch.coveredThroughMessageId ?? input.coveredThroughMessageId
  )
  await input.onCompaction?.(summary, coveredThroughMessageId)
  const summaryMessage: PiAgentMessage = {
    role: 'user',
    content: `<conversation-summary>\n${summary}\n</conversation-summary>`,
    timestamp: Date.now(),
    isContextSummary: true,
  }
  return {
    messages: [
      ...(systemMessage ? [systemMessage] : []),
      summaryMessage,
      ...conversationalMessages.slice(firstRetainedIndex),
    ],
    summary,
    coveredThroughMessageId,
  }
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
  contextSummary?: string | null
  contextSummaryMessageId?: number | null
  onCompaction?: (summary: string, coveredThroughMessageId: number) => Promise<void>
  onCompactionUsage?: (usage: PiModelUsage) => void | Promise<void>
  onConfirmationRequested?: (toolCallId: string, confirmation: AiAgentConfirmationSummary) => void
  getTelemetrySpan?: () => TelemetrySpan | undefined
}) {
  const models = await createPiModels()
  const runtimeConfig = await getRuntimeConfig()
  const modelName = runtimeConfig.chat.model
  const model = models.getModel('api-starter-openai', modelName)
  if (!model) throw new Error(`Pi model is not configured: ${modelName}`)

  let hasQueuedMessages = () => false
  let consecutiveReadToolFailures = 0
  const summaryOptions = getAiAgentSummarizationOptions()
  let contextSummary = truncateTextToTokenBudget(
    input.contextSummary ?? '',
    summaryOptions.maxOutputTokens
  )
  let contextSummaryMessageId = input.contextSummaryMessageId ?? 0
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
        ...(contextSummary
          ? [
              {
                role: 'user' as const,
                content: `<conversation-summary>\n${contextSummary}\n</conversation-summary>`,
                timestamp: Date.now(),
                isContextSummary: true,
              },
            ]
          : []),
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
      if (summaryOptions.enabled && estimatePiMessages(messages) > tokenBudget) {
        try {
          const compactedMessages = await compactPiContext({
            messages,
            models,
            model,
            tokenBudget,
            previousSummary: contextSummary,
            coveredThroughMessageId: contextSummaryMessageId,
            summaryInputTokenBudget: summaryOptions.maxInputTokens,
            summaryOutputTokenBudget: Math.min(summaryOptions.maxOutputTokens, model.maxTokens),
            signal,
            onCompaction: input.onCompaction,
            onUsage: input.onCompactionUsage,
            getTelemetrySpan: input.getTelemetrySpan,
          })
          if (compactedMessages) {
            contextSummary = compactedMessages.summary
            contextSummaryMessageId = compactedMessages.coveredThroughMessageId
            return trimPiContextToTokenBudget(compactedMessages.messages, tokenBudget)
          }
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
    beforeToolCall: async ({ toolCall, args }) => {
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        return { block: true, terminate: true, reason: '工具参数必须是对象' }
      }
      const tool = input.tools.find((candidate) => candidate.name === toolCall.name) as
        | AiAgentToolWithConfirmation
        | undefined
      if (tool?.prepareConfirmation) {
        try {
          const confirmation = await tool.prepareConfirmation(args)
          input.onConfirmationRequested?.(toolCall.id, confirmation)
          return { block: true, terminate: true, reason: '等待用户确认后执行' }
        } catch (error) {
          return {
            block: true,
            terminate: true,
            reason: error instanceof Error ? error.message : '无法准备确认提案',
          }
        }
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
