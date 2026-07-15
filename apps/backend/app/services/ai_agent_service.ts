import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import { ChatOpenAI } from '@langchain/openai'
import { createAgent, summarizationMiddleware } from 'langchain'

import { aiAgentCapabilities, createAiAgentTools } from '#services/ai_agent_registry'
import { createAiAgentThreadId } from '#services/ai_agent_state'
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

function getContextCompressionOptions() {
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

function createSystemPrompt(context?: AiAgentPageContext) {
  const pageContext = context
    ? ` The user is currently on the "${context.title}" page (${context.route}). Treat this as navigation context only; do not assume access to page data.`
    : ''
  const actions = context?.actions?.length
    ? ` Available client actions: ${context.actions.map((action) => `${action.id} (${action.label}: ${action.description})`).join('; ')}. You may suggest an action with [[action:<id>]].`
    : ''
  const items = context?.items?.length
    ? ` Additional page context: ${context.items.map((item) => `${item.label}: ${item.value}`).join('; ')}.`
    : ''
  const configuredPrompt =
    env.get('AI_SYSTEM_PROMPT')?.trim() ||
    'You are a concise product assistant for an admin console. Answer in the user language. Keep responses practical and focused on the available capabilities.'

  return `${configuredPrompt}${pageContext}${items}${actions} Never claim that you performed a write action. Server-side business tools are introduced only after they enforce their own permission and confirmation policy.`
}

function createPostgresConnectionString() {
  const user = encodeURIComponent(env.get('DB_USER'))
  const password = encodeURIComponent(env.get('DB_PASSWORD'))
  const host = env.get('DB_HOST')
  const port = env.get('DB_PORT')
  const database = encodeURIComponent(env.get('DB_DATABASE'))

  return `postgresql://${user}:${password}@${host}:${port}/${database}`
}

const checkpointer = PostgresSaver.fromConnString(createPostgresConnectionString(), {
  schema: 'langgraph',
})

function createModel() {
  return new ChatOpenAI({
    apiKey: env.get('AI_OPENAI_API_KEY') || 'no-key',
    configuration: {
      baseURL: env.get('AI_OPENAI_BASE_URL')?.replace(/\/+$/, ''),
    },
    model: getModel(),
    temperature: getTemperature(),
  })
}

function createAiAgent(userId: number, context?: AiAgentPageContext) {
  const compression = getContextCompressionOptions()
  const model = createModel()

  return createAgent({
    model,
    tools: createAiAgentTools(userId),
    systemPrompt: createSystemPrompt(context),
    checkpointer,
    middleware: compression.enabled
      ? [
          summarizationMiddleware({
            model,
            trigger: { tokens: compression.thresholdTokens },
            keep: { messages: compression.recentMessageCount },
          }),
        ]
      : [],
  })
}

export function getAiAgentCapabilities() {
  return aiAgentCapabilities
}

export async function hasAiAgentCheckpoint(conversationId: number, userId: number) {
  const threadId = createAiAgentThreadId(userId, conversationId)
  return Boolean(await checkpointer.getTuple({ configurable: { thread_id: threadId } }))
}

export async function deleteAiAgentCheckpoint(conversationId: number, userId: number) {
  await checkpointer.deleteThread(createAiAgentThreadId(userId, conversationId))
}

export async function createAiAgentStream(input: {
  conversationId: number
  userId: number
  messages: AiAgentMessage[]
  context?: AiAgentPageContext
}) {
  const agent = createAiAgent(input.userId, input.context)
  const threadId = createAiAgentThreadId(input.userId, input.conversationId)

  return agent.streamEvents(
    {
      messages: input.messages.map((message) => ({
        type: message.role,
        content: message.content,
      })),
    },
    {
      configurable: { thread_id: threadId },
      version: 'v3',
    }
  )
}
