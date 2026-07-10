import env from '#start/env'
import OpenAI from 'openai'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const systemPrompt =
  'You are a concise product assistant for an API starter kit admin console. Answer in the user language. Keep responses practical and focused on pure chat.'

function getApiBaseUrl() {
  return env.get('AI_OPENAI_BASE_URL')?.replace(/\/+$/, '') ?? 'https://api.deepseek.com'
}

export async function createDeepSeekChatCompletion(messages: ChatMessage[]) {
  const apiKey = env.get('AI_OPENAI_API_KEY')

  if (!apiKey) {
    throw new Error('AI_OPENAI_API_KEY is not configured')
  }

  const client = new OpenAI({
    apiKey,
    baseURL: getApiBaseUrl(),
  })

  const completion = await client.chat.completions.create({
    model: env.get('AI_OPENAI_MODEL') ?? 'deepseek-v4-pro',
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    stream: false,
    temperature: 0.3,
  })

  const content = completion.choices[0]?.message.content?.trim()
  if (!content) {
    throw new Error('AI response is empty')
  }

  return content
}

export async function createDeepSeekChatCompletionStream(messages: ChatMessage[]) {
  const apiKey = env.get('AI_OPENAI_API_KEY')

  if (!apiKey) {
    throw new Error('AI_OPENAI_API_KEY is not configured')
  }

  const client = new OpenAI({
    apiKey,
    baseURL: getApiBaseUrl(),
  })

  return client.chat.completions.create({
    model: env.get('AI_OPENAI_MODEL') ?? 'deepseek-v4-pro',
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    stream: true,
    temperature: 0.3,
  })
}
