import { ApiError, apiRequest } from '@/lib/api'
import { readItem, readList } from '@/lib/api-types'

export type AiChatRole = 'user' | 'assistant'

export interface AiChatMessage {
  id: number
  conversationId: number
  role: AiChatRole
  content: string
  createdAt: string
  updatedAt: string
}

export interface AiChatConversationSummary {
  id: number
  title: string
  createdAt: string
  updatedAt: string
}

export interface AiChatConversation extends AiChatConversationSummary {
  messages: AiChatMessage[]
}

export interface AiChatDeleteResult {
  id: number
  deleted: boolean
}

export interface AiChatPageContext {
  route: string
  title: string
  actions?: Array<{
    id: string
    label: string
    description: string
  }>
  items?: Array<{
    label: string
    value: string
  }>
}

export interface AiChatClientAction {
  id: string
  label: string
  description: string
  requiresConfirmation?: boolean
}

function authOptions(token: string | null) {
  return { token }
}

export async function listAiChatConversations(token: string | null) {
  const response = await apiRequest<AiChatConversationSummary[]>(
    '/api/v1/ai-chat/conversations',
    authOptions(token)
  )
  return readList(response)
}

export async function createAiChatConversation(token: string | null) {
  const response = await apiRequest<AiChatConversation>('/api/v1/ai-chat/conversations', {
    ...authOptions(token),
    method: 'POST',
    body: JSON.stringify({}),
  })
  return readItem(response)
}

export async function getAiChatConversation(token: string | null, id: number) {
  const response = await apiRequest<AiChatConversation>(`/api/v1/ai-chat/conversations/${id}`, {
    ...authOptions(token),
  })
  return readItem(response)
}

export async function sendAiChatMessage(token: string | null, id: number, content: string) {
  const response = await apiRequest<AiChatConversation>(
    `/api/v1/ai-chat/conversations/${id}/messages`,
    {
      ...authOptions(token),
      method: 'POST',
      body: JSON.stringify({ content }),
    }
  )
  return readItem(response)
}

type AiChatStreamEvent =
  | { type: 'user'; conversation: AiChatConversationSummary; message: AiChatMessage }
  | { type: 'delta'; content: string }
  | { type: 'done'; conversation: AiChatConversation; message: AiChatMessage }
  | { type: 'error'; message: string }

export async function streamAiChatMessage(
  token: string | null,
  id: number,
  content: string,
  onEvent: (event: AiChatStreamEvent) => void,
  signal?: AbortSignal,
  context?: AiChatPageContext
) {
  const headers = new Headers({
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  })

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`/api/v1/ai-chat/conversations/${id}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content, context }),
    signal,
  })

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null)
    throw new ApiError(payload?.message ?? 'AI request failed', response.status)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  function consumeEvent(raw: string) {
    const lines = raw.split('\n')
    const event = lines
      .find((line) => line.startsWith('event:'))
      ?.slice('event:'.length)
      .trim()
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .join('\n')

    if (!event || !data) {
      return
    }

    onEvent({ type: event, ...JSON.parse(data) } as AiChatStreamEvent)
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })

    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    events.forEach(consumeEvent)

    if (done) {
      if (buffer.trim()) {
        consumeEvent(buffer)
      }
      break
    }
  }
}

export async function deleteAiChatConversation(token: string | null, id: number) {
  const response = await apiRequest<AiChatDeleteResult>(`/api/v1/ai-chat/conversations/${id}`, {
    ...authOptions(token),
    method: 'DELETE',
  })
  return readItem(response)
}
