import { ApiError, apiRequest } from '@/lib/api'
import { readItem, readList } from '@/lib/api-types'

export type AiChatRole = 'user' | 'assistant'

export interface AiChatMessage {
  id: number
  conversationId: number
  role: AiChatRole
  content: string
  citations: AiChatCitation[]
  createdAt: string
  updatedAt: string
  timeline?: AiChatTimelineItem[]
}

export interface AiChatCitation {
  documentId: number
  chunkId: number
  title: string
  excerpt: string
}

export interface AiChatConversationSummary {
  id: number
  title: string
  createdAt: string
  updatedAt: string
}

export interface AiChatConversation extends AiChatConversationSummary {
  messages: AiChatMessage[]
  confirmations?: AiChatConfirmation[]
}

export interface AiChatConfirmation {
  id: number
  messageId: number
  action: string
  impact: 'standard' | 'destructive'
  targetType: string
  targetId: string
  targetSummary: Record<string, unknown>
  changeSummary: Array<{ field: string; value: string }>
  expiresAt: string | null
  presentation: {
    title: string
    summary: string
    targetLabel: string
    changes: Array<{ label: string; value: string }>
    impactLabel: string
    approveLabel: string
    cancelLabel: string
  }
}
export interface AiChatCredentialDisclosure {
  kind: 'api_key' | 'password'
  value: string
  label: string
}

export interface AiChatActionResultMessage {
  id: number
  conversationId: number
  role: 'assistant'
  content: string
  citations: AiChatCitation[]
  createdAt: string
  updatedAt: string
}

export type AiChatPendingConfirmation = Omit<AiChatConfirmation, 'messageId'>

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
}

// The backend limits a complete AI run to five minutes at most. Keep a small
// client-side grace period so a proxy or a broken SSE connection cannot leave
// the assistant in its loading state indefinitely.
const AI_STREAM_TIMEOUT_MS = 305_000

export interface AiChatAgentActivity {
  name: string
  state: 'running' | 'done' | 'error'
  callId?: string
  durationMs?: number
  message?: string
  errorCode?: 'permission_denied' | 'invalid_input' | 'conflict' | 'failed'
  phase?: string
  detail?: {
    templateCode?: string
    action?: string
    permissionCode?: string
    targetType?: string
    targetId?: string | number
    targetLabel?: string
    resultCount?: number
    message?: string
    progress?: number
    completed?: number
    total?: number
  }
}

export interface AiChatRunUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  modelCalls: number
}

export interface AiChatRunMeta {
  agentRunId: string
  usage: AiChatRunUsage
  durationMs: number
}

export type AiChatTimelineItem =
  | { kind: 'plan'; steps: AiChatPlanStep[] }
  | ({ kind: 'tool' } & AiChatAgentActivity)
  | {
      kind: 'run'
      durationMs: number
      usage: AiChatRunUsage
    }
  | {
      kind: 'confirmation'
      action: string
      targetLabel?: string
      status: 'confirmed' | 'failed' | 'expired'
      completedAt: string
    }

export interface AiChatPlanStep {
  key: 'identify_target' | 'prepare_proposal' | 'await_confirmation'
  state: 'pending' | 'running' | 'done'
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
  | {
      type: 'agent_status'
      name: string
      state: AiChatAgentActivity['state']
      callId?: string
      durationMs?: number
      message?: string
      errorCode?: AiChatAgentActivity['errorCode']
      phase?: string
      detail?: AiChatAgentActivity['detail']
    }
  | { type: 'agent_plan'; steps: AiChatPlanStep[] }
  | { type: 'agent_citations'; citations: AiChatCitation[] }
  | ({ type: 'agent_confirmation' } & AiChatPendingConfirmation)
  | ({ type: 'run' } & AiChatRunMeta)
  | {
      type: 'done'
      conversation: AiChatConversation
      message: AiChatMessage
      confirmations: Omit<AiChatConfirmation, 'messageId'>[]
    }
  | { type: 'error'; message: string; assistantMessage?: AiChatMessage }

export async function streamAiChatMessage(
  token: string | null,
  id: number,
  content: string,
  onEvent: (event: AiChatStreamEvent) => void,
  options: AiChatStreamOptions = {}
) {
  const requestController = new AbortController()
  const abortFromCaller = () => requestController.abort(options.signal?.reason)
  const timeout = setTimeout(() => {
    requestController.abort(new DOMException('AI response timed out', 'TimeoutError'))
  }, AI_STREAM_TIMEOUT_MS)

  if (options.signal?.aborted) {
    abortFromCaller()
  } else {
    options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  }

  const headers = new Headers({
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  })

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  try {
    const response = await fetch(`/api/v1/ai-chat/conversations/${id}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content,
        context: options.context,
        regenerateAssistantMessageId: options.regenerateAssistantMessageId,
      }),
      signal: requestController.signal,
    })

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => null)
      throw new ApiError(payload?.message ?? 'AI request failed', response.status)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let receivedTerminalEvent = false

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

      receivedTerminalEvent ||= event === 'done' || event === 'error'
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
        if (!receivedTerminalEvent) {
          throw new AiChatStreamIncompleteError()
        }
        break
      }
    }
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}

export async function queueAiChatMessage(
  token: string | null,
  id: number,
  content: string,
  mode: 'steer' | 'followUp'
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

export async function confirmAiAgentAction(
  token: string | null,
  conversationId: number,
  confirmationId: number
) {
  const response = await apiRequest<
    Omit<AiChatConfirmation, 'messageId'> & {
      result?: { credential?: AiChatCredentialDisclosure }
      message: AiChatActionResultMessage
    }
  >(`/api/v1/ai-chat/conversations/${conversationId}/confirmations/${confirmationId}/confirm`, {
    ...authOptions(token),
    method: 'POST',
  })
  return readItem(response)
}
