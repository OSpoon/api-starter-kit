import type {
  AiChatConfirmation,
  AiChatConversationSummary,
  AiChatMessage,
  AiChatStreamEvent,
} from '@api-starter-kit/ai-chat-contract'

import { ApiError, apiRequest, apiRequestCredentials, apiRequestHeaders, apiUrl } from '@/lib/api'
import { readItem } from '@/lib/api-types'
import { buildListQuery } from '@/lib/list-query'
import { readSseEvents } from '@/lib/sse'

export type {
  AiChatAgentActivity,
  AiChatAgentActivityDetail,
  AiChatAgentPhaseEvent,
  AiChatCitation,
  AiChatConfirmation,
  AiChatConversationSummary,
  AiChatCredentialDisclosure,
  AiChatMessage,
  AiChatPendingConfirmation,
  AiChatPlanStep,
  AiChatRole,
  AiChatRunMeta,
  AiChatRunPhase,
  AiChatRunUsage,
  AiChatStreamEvent,
  AiChatStreamEventMap,
  AiChatTimelineItem,
} from '@api-starter-kit/ai-chat-contract'

export interface AiChatPaginationMeta {
  currentPage: number
  perPage: number
  lastPage: number
  total: number
}

export interface AiChatConversationPage {
  items: AiChatConversationSummary[]
  meta: AiChatPaginationMeta
}

export interface AiChatConversation extends AiChatConversationSummary {
  messages: AiChatMessage[]
  messagesMeta?: AiChatPaginationMeta
  confirmations?: AiChatConfirmation[]
}

export interface AiChatDeleteResult {
  id: number
  deleted: boolean
}

export interface AiChatPageContext {
  route: string
  title: string
}

export interface AiChatStreamOptions {
  signal?: AbortSignal
  context?: AiChatPageContext
  regenerateAssistantMessageId?: number
  image?: File
  pdf?: File
}

// The backend limits a complete AI run to five minutes at most. Keep a small
// client-side grace period so a proxy or a broken SSE connection cannot leave
// the assistant in its loading state indefinitely.
const AI_STREAM_TIMEOUT_MS = 305_000

export interface AiChatUsageModel {
  modelId: string
  providerId: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  modelCalls: number
  estimatedCostUsd: number | null
  priced: boolean
}

export interface AiChatUsageSummary {
  period: 'current_month'
  periodStart: string
  periodEnd: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  modelCalls: number
  estimatedCostUsd: number | null
  pricingSource: 'models.dev' | 'mixed' | 'unavailable'
  unpricedModelCount: number
  models: AiChatUsageModel[]
}

export class AiChatStreamIncompleteError extends Error {
  constructor() {
    super('AI stream ended before a terminal event')
    this.name = 'AiChatStreamIncompleteError'
  }
}

function authOptions(token: string | null) {
  return { token }
}

export async function listAiChatConversations(token: string | null, page = 1) {
  const response = await apiRequest<AiChatConversationPage>(
    `/api/v1/ai-chat/conversations?${buildListQuery(page)}`,
    authOptions(token)
  )
  return readItem(response)
}

export async function getAiChatUsage(token: string | null) {
  const response = await apiRequest<AiChatUsageSummary>('/api/v1/ai-chat/usage', authOptions(token))
  return readItem(response)
}

export async function createAiChatConversation(token: string | null) {
  const response = await apiRequest<AiChatConversation>('/api/v1/ai-chat/conversations', {
    ...authOptions(token),
    method: 'POST',
    body: JSON.stringify({}),
  })
  return readItem(response)
}

export async function getAiChatConversation(token: string | null, id: number, page = 1) {
  const response = await apiRequest<AiChatConversation>(
    `/api/v1/ai-chat/conversations/${id}?${buildListQuery(page, {}, 50)}`,
    authOptions(token)
  )
  return readItem(response)
}

export async function transcribeAiChatAudio(token: string | null, audio: Blob, fileName: string) {
  const body = new FormData()
  body.append('audio', audio, fileName)
  const response = await apiRequest<{ data: { text: string } }>('/api/v1/ai-chat/transcribe', {
    ...authOptions(token),
    method: 'POST',
    body,
  })
  return readItem(response).text
}

async function streamAiChatRequest(
  token: string | null,
  path: string,
  init: RequestInit,
  onEvent: (event: AiChatStreamEvent) => void,
  signal?: AbortSignal
) {
  const requestController = new AbortController()
  const abortFromCaller = () => requestController.abort(signal?.reason)
  const timeout = setTimeout(() => {
    requestController.abort(new DOMException('AI response timed out', 'TimeoutError'))
  }, AI_STREAM_TIMEOUT_MS)

  if (signal?.aborted) {
    abortFromCaller()
  } else {
    signal?.addEventListener('abort', abortFromCaller, { once: true })
  }

  const headers = apiRequestHeaders(path, init.headers)
  headers.set('Accept', 'text/event-stream')
  if (
    init.body &&
    !headers.has('Content-Type') &&
    !(typeof FormData !== 'undefined' && init.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) headers.set('Authorization', `Bearer ${token}`)

  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      credentials: apiRequestCredentials(path, init.credentials),
      headers,
      signal: requestController.signal,
    })

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => null)
      throw new ApiError(payload?.message ?? 'AI request failed', response.status)
    }

    let receivedTerminalEvent = false
    await readSseEvents(response.body, (event, data) => {
      receivedTerminalEvent ||= event === 'done' || event === 'error'
      onEvent({ type: event, ...JSON.parse(data) } as AiChatStreamEvent)
    })
    if (!receivedTerminalEvent) throw new AiChatStreamIncompleteError()
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

export function streamAiChatMessage(
  token: string | null,
  id: number,
  content: string,
  onEvent: (event: AiChatStreamEvent) => void,
  options: AiChatStreamOptions = {}
) {
  const body = options.image || options.pdf ? new FormData() : undefined
  if (body) {
    if (content.trim()) body.append('content', content)
    if (options.image) body.append('image', options.image)
    if (options.pdf) {
      body.append('pdf', options.pdf)
      body.append('pdfMineruConsent', 'true')
    }
    if (options.context) {
      body.append('contextRoute', options.context.route)
      body.append('contextTitle', options.context.title)
    }
    if (options.regenerateAssistantMessageId) {
      body.append('regenerateAssistantMessageId', String(options.regenerateAssistantMessageId))
    }
  }

  return streamAiChatRequest(
    token,
    `/api/v1/ai-chat/conversations/${id}/messages`,
    {
      method: 'POST',
      body:
        body ??
        JSON.stringify({
          ...(content.trim() ? { content } : {}),
          context: options.context,
          regenerateAssistantMessageId: options.regenerateAssistantMessageId,
        }),
    },
    onEvent,
    options.signal
  )
}

export async function getAiChatMessageImage(
  token: string | null,
  conversationId: number,
  messageId: number,
  signal?: AbortSignal
) {
  const path = `/api/v1/ai-chat/conversations/${conversationId}/messages/${messageId}/image`
  const headers = apiRequestHeaders(path)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(apiUrl(path), {
    credentials: apiRequestCredentials(path),
    headers,
    signal,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new ApiError(payload?.message ?? 'Unable to load image attachment', response.status)
  }
  return response.blob()
}

export function streamAiAgentActionConfirmation(
  token: string | null,
  conversationId: number,
  confirmationId: number,
  onEvent: (event: AiChatStreamEvent) => void,
  signal?: AbortSignal
) {
  return streamAiChatRequest(
    token,
    `/api/v1/ai-chat/conversations/${conversationId}/confirmations/${confirmationId}/confirm/stream`,
    { method: 'POST' },
    onEvent,
    signal
  )
}

export function streamAiAgentActionCancellation(
  token: string | null,
  conversationId: number,
  confirmationId: number,
  onEvent: (event: AiChatStreamEvent) => void,
  signal?: AbortSignal
) {
  return streamAiChatRequest(
    token,
    `/api/v1/ai-chat/conversations/${conversationId}/confirmations/${confirmationId}/cancel/stream`,
    { method: 'POST' },
    onEvent,
    signal
  )
}

export type AiChatQueueMode = 'steer' | 'followUp'

export async function queueAiChatMessage(
  token: string | null,
  id: number,
  content: string,
  mode: AiChatQueueMode
) {
  const response = await apiRequest<{
    queued: boolean
    mode: string
    agentRunId: string
    message: AiChatMessage
  }>(`/api/v1/ai-chat/conversations/${id}/${mode === 'steer' ? 'steer' : 'follow-up'}`, {
    ...authOptions(token),
    method: 'POST',
    body: JSON.stringify({ content }),
  })
  return readItem(response)
}

export async function deleteAiChatConversation(token: string | null, id: number) {
  const response = await apiRequest<AiChatDeleteResult>(`/api/v1/ai-chat/conversations/${id}`, {
    ...authOptions(token),
    method: 'DELETE',
  })
  return readItem(response)
}
