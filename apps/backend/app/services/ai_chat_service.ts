import OpenAI from 'openai'

import env from '#start/env'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const systemPrompt =
  'You are a concise product assistant for an API starter kit admin console. Answer in the user language. Keep responses practical and focused on pure chat.'

function createClient() {
  const apiKey = env.get('AI_OPENAI_API_KEY') || 'no-key'
  const baseURL = env.get('AI_OPENAI_BASE_URL')?.replace(/\/+$/, '')

  return new OpenAI({ apiKey, baseURL })
}

function getModel() {
  return env.get('AI_OPENAI_MODEL') ?? 'gpt-4o-mini'
}

export async function createChatCompletion(messages: ChatMessage[]) {
  const client = createClient()

  const completion = await client.chat.completions.create({
    model: getModel(),
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

export async function createChatCompletionStream(messages: ChatMessage[]) {
  const client = createClient()

  return client.chat.completions.create({
    model: getModel(),
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    stream: true,
    temperature: 0.3,
  })
}
