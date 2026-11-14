import type { AgentMessage } from '@earendil-works/pi-agent-core'
import { type Api, type createModels, type Message, type Model } from '@earendil-works/pi-ai'
import { estimateContextTokens, estimateMessageTokens } from '@earendil-works/pi-ai/utils/estimate'
import { getCurrentSystemMessage } from '@earendil-works/pi-ai/utils/transcript'
import type { TelemetrySpan } from '@earendil-works/pi-telemetry'

import type { AgentModelUsage } from '../agent.js'
import type { PiAgentMessage } from './types.js'

export function estimatePiMessages(messages: AgentMessage[]) {
  return estimateContextTokens(getPiContextMessages(messages)).tokens
}

export function getPiContextMessages(messages: AgentMessage[]): Message[] {
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

export function truncateTextToTokenBudget(content: string, tokenBudget: number) {
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

export async function compactPiContext(input: {
  messages: AgentMessage[]
  models: ReturnType<typeof createModels>
  model: Model<Api>
  tokenBudget: number
  previousSummary: string
  summaryPrompt: string
  coveredThroughMessageId: number
  summaryInputTokenBudget: number
  summaryOutputTokenBudget: number
  signal?: AbortSignal
  onCompaction?: (summary: string, coveredThroughMessageId: number) => Promise<void>
  onUsage?: (usage: AgentModelUsage) => void | Promise<void>
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
    systemPrompt: input.summaryPrompt,
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
          },
        },
        async (span) => {
          const result = await input.models.completeSimple(input.model, summaryContext, {
            signal: input.signal,
            telemetry: span,
            maxTokens: input.summaryOutputTokenBudget,
          })
          span.setAttributes({
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
