import OpenAI from 'openai'

import env from '#start/env'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatContext {
  route: string
  title: string
  actions?: Array<{ id: string; label: string; description: string }>
  items?: Array<{ label: string; value: string }>
}

function createSystemPrompt(context?: ChatContext) {
  const pageContext = context
    ? ` The user is currently on the "${context.title}" page (${context.route}). Treat this as navigation context only; do not assume access to page data.`
    : ''

  const actions = context?.actions?.length
    ? ` Available client actions: ${context.actions.map((action) => `${action.id} (${action.label}: ${action.description})`).join('; ')}. You may suggest an action with [[action:<id>]].`
    : ''
  const items = context?.items?.length
    ? ` Additional page context: ${context.items.map((item) => `${item.label}: ${item.value}`).join('; ')}.`
    : ''

  const defaultPrompt =
    'You are a concise product assistant for an admin console. Answer in the user language. Keep responses practical and focused on pure chat.'
  const configuredPrompt = env.get('AI_SYSTEM_PROMPT')?.trim() || defaultPrompt

  return `${configuredPrompt}${pageContext}${items}${actions} Never claim that you performed a write action.`
}

function createClient() {
  const apiKey = env.get('AI_OPENAI_API_KEY') || 'no-key'
  const baseURL = env.get('AI_OPENAI_BASE_URL')?.replace(/\/+$/, '')

  return new OpenAI({ apiKey, baseURL })
}

function getModel() {
  return env.get('AI_OPENAI_MODEL') ?? 'gpt-4o-mini'
}

function getTemperature() {
  return Math.min(Math.max(env.get('AI_TEMPERATURE') ?? 0.3, 0), 2)
}

export function getHistoryMessageLimit() {
  return Math.min(Math.max(env.get('AI_MAX_HISTORY_MESSAGES') ?? 20, 1), 100)
}

export async function createChatCompletion(messages: ChatMessage[], context?: ChatContext) {
  const client = createClient()

  const completion = await client.chat.completions.create({
    model: getModel(),
    messages: [{ role: 'system', content: createSystemPrompt(context) }, ...messages],
    stream: false,
    temperature: getTemperature(),
  })

  const content = completion.choices[0]?.message.content?.trim()
  if (!content) {
    throw new Error('AI response is empty')
  }

  return content
}

export async function createChatCompletionStream(messages: ChatMessage[], context?: ChatContext) {
  const client = createClient()

  return client.chat.completions.create({
    model: getModel(),
    messages: [{ role: 'system', content: createSystemPrompt(context) }, ...messages],
    stream: true,
    temperature: getTemperature(),
  })
}
