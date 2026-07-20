import crypto from 'node:crypto'

import { ChatOpenAI } from '@langchain/openai'
import { createAgent } from 'langchain'

import { aiAgentCapabilities, createAiAgentTools } from '#services/ai_agent_registry'
import env from '#start/env'

export interface AiAgentPageContext {
  route: string
  title: string
  actions?: Array<{ id: string; label: string; description: string }>
  items?: Array<{ label: string; value: string }>
}

export interface AiAgentMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

function getModel() {
  return env.get('AI_OPENAI_MODEL') ?? 'gpt-4o-mini'
}

function getTemperature() {
  return Math.min(Math.max(env.get('AI_TEMPERATURE') ?? 0.3, 0), 2)
}

function getHistoryMessageLimit() {
  return Math.min(Math.max(env.get('AI_MAX_HISTORY_MESSAGES') ?? 20, 1), 100)
}

export function getContextCompressionOptions() {
  return {
    enabled: env.get('AI_CONTEXT_COMPRESSION_ENABLED') ?? true,
    thresholdTokens: Math.min(
      Math.max(env.get('AI_CONTEXT_COMPRESSION_THRESHOLD_TOKENS') ?? 6000, 1024),
      1_000_000
    ),
    recentMessageCount: Math.min(
      Math.max(env.get('AI_CONTEXT_COMPRESSION_RECENT_MESSAGES') ?? 8, 1),
      getHistoryMessageLimit()
    ),
  }
}

export async function summarizeAiConversation(input: {
  existingSummary: string | null
  messages: AiAgentMessage[]
}) {
  const sourceMessages = input.messages
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n\n')
  const response = await createModel().invoke([
    {
      role: 'system',
      content:
        'Create a compact factual conversation summary for future assistant context. Preserve user goals, confirmed facts, decisions, constraints, unresolved questions, and pending action proposals. Do not invent details or include secrets.',
    },
    {
      role: 'user',
      content: `${input.existingSummary ? `Previous summary:\n${input.existingSummary}\n\n` : ''}Messages to incorporate:\n${sourceMessages}`,
    },
  ])
  const summary = typeof response.content === 'string' ? response.content.trim() : ''
  if (!summary) {
    throw new Error('AI context summarization returned no text')
  }
  return summary
}

function createSystemPrompt(context?: AiAgentPageContext) {
  const pageContext = context
    ? ` The user is currently on the "${context.title}" page (${context.route}). Treat this as navigation context only; do not assume access to page data.`
    : ''
  const items = context?.items?.length
    ? ` Additional page context: ${context.items.map((item) => `${item.label}: ${item.value}`).join('; ')}.`
    : ''
  const configuredPrompt =
    env.get('AI_SYSTEM_PROMPT')?.trim() ||
    'You are a concise product assistant for an admin console. Answer in the user language. Keep responses practical and focused on the available capabilities.'

  return `${configuredPrompt}${pageContext}${items} Never generate client action markers such as [[action:...]]. Never claim that you performed a write action, received approval, or that a change will execute. Never ask the user to reply with approval or cancellation text. Server-side business tools are introduced only after they enforce their own permission and confirmation policy. If a permission check denies an operation, clearly state that the user lacks that permission and end the response; never propose a request, ask for confirmation, or instruct the user to seek a text-based approval. When a protected action needs approval, only the structured confirmation card supplied by the product can authorize it; if no card is present, state that no action is pending.`
}

function getRequestTimeout() {
  return Math.min(Math.max(env.get('AI_REQUEST_TIMEOUT_MS') ?? 60_000, 5_000), 300_000)
}

function getMaxRetries() {
  return Math.min(Math.max(env.get('AI_MAX_RETRIES') ?? 2, 0), 5)
}

function createModel() {
  return new ChatOpenAI({
    apiKey: env.get('AI_OPENAI_API_KEY') || 'no-key',
    configuration: {
      baseURL: env.get('AI_OPENAI_BASE_URL')?.replace(/\/+$/, ''),
    },
    model: getModel(),
    temperature: getTemperature(),
    timeout: getRequestTimeout(),
    maxRetries: getMaxRetries(),
  })
}

function createAiAgent(input: {
  userId: number
  conversationId: number
  agentRunId: string
  context?: AiAgentPageContext
}) {
  const model = createModel()

  return createAgent({
    model,
    tools: createAiAgentTools(input),
    systemPrompt: createSystemPrompt(input.context),
  })
}

export function getAiAgentCapabilities() {
  return aiAgentCapabilities
}

export async function createAiAgentStream(input: {
  conversationId: number
  userId: number
  messages: AiAgentMessage[]
  context?: AiAgentPageContext
}) {
  const agentRunId = crypto.randomUUID()
  const agent = createAiAgent({ ...input, agentRunId })

  const stream = await agent.streamEvents(
    {
      messages: input.messages.map((message) => ({
        type: message.role,
        content: message.content,
      })),
    },
    { version: 'v3' }
  )
  return { stream, agentRunId }
}
