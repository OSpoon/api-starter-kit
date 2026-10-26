import { ApiError, apiRequest, apiUrl } from '@/lib/api'
import { readItem } from '@/lib/api-types'
import { buildListQuery } from '@/lib/list-query'

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

export interface AiChatConfirmation {
  id: number
  messageId: number
  action: string
  status?: 'pending' | 'confirmed' | 'expired' | 'failed' | 'cancelled'
  impact: 'standard' | 'destructive'
  targetType: string
  targetId: string | null
  targetSummary: Record<string, unknown>
  changeSummary: Array<{ field: string; value: string }>
  expiresAt: string | null
  presentation: {
    title: string
    summary: string
    targetLabel: string | null
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
  startedAt?: number
  displayName?: string
  durationMs?: number
  message?: string
  errorCode?: 'permission_denied' | 'invalid_input' | 'conflict' | 'failed' | 'tool_not_registered'
  phase?: string
  detail?: {
    templateCode?: string
    action?: string
    permissionCode?: string
    targetType?: string
    targetId?: string | number
    targetLabel?: string
    confirmationId?: number
    toolName?: string
    resultCount?: number
    message?: string
    progress?: number
    completed?: number
    total?: number
    parameterSummary?: Array<{ name: string; type: string }>
    skillCode?: string
    skillName?: string
    skillInstructionCharacters?: number
    skillCount?: number
    skillNames?: string[]
    resultSummary?: AiChatMcpResultSummary
  }
}

export interface AiChatMcpResultSummary {
  contentTypes: string[]
  textCharacters: number
  structuredType?: 'array' | 'object' | 'string' | 'number' | 'boolean' | 'null'
  structuredCount?: number
}

export interface AiChatRunPhase {
  kind: 'phase'
  name: 'preparing_agent' | 'mcp_discovery' | 'model_response'
  state: 'running' | 'done' | 'error'
  callId: string
  startedAt: number
  durationMs?: number
  serverName?: string
  toolCount?: number
  tools?: Array<{ name: string; mode?: 'read' | 'confirm' }>
}

export interface AiChatRunUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  totalTokens: number
  modelCalls: number
}

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

export interface AiChatRunMeta {
  agentRunId: string
  usage: AiChatRunUsage
  durationMs: number
}

export type AiChatTimelineItem =
  | { kind: 'plan'; turn?: number; steps: AiChatPlanStep[] }
  | AiChatRunPhase
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
      status: 'confirmed' | 'failed' | 'expired' | 'cancelled'
      completedAt: string
    }

export interface AiChatPlanStep {
  key: 'identify_target' | 'prepare_action' | 'await_confirmation'
  state: 'pending' | 'running' | 'done'
  startedAt?: number
  durationMs?: number
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
    `/api/v1/ai-chat/conversations/${id}?${buildListQuery(page, '', {}, 50)}`,
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

type AiChatStreamEvent =
  | { type: 'user'; conversation: AiChatConversationSummary; message: AiChatMessage }
  | { type: 'delta'; content: string }
  | { type: 'assistant_segment_start' }
  | {
      type: 'agent_status'
      name: string
      state: AiChatAgentActivity['state']
      callId?: string
      startedAt?: number
      displayName?: string
      durationMs?: number
      message?: string
      errorCode?: AiChatAgentActivity['errorCode']
      phase?: string
      detail?: AiChatAgentActivity['detail']
    }
  | ({ type: 'agent_phase' } & Omit<AiChatRunPhase, 'kind'>)
  | { type: 'agent_plan'; steps: AiChatPlanStep[] }
  | { type: 'agent_citations'; citations: AiChatCitation[] }
  | ({ type: 'agent_confirmation' } & AiChatPendingConfirmation)
  | ({ type: 'run' } & AiChatRunMeta)
  | { type: 'credential_disclosure'; credential: AiChatCredentialDisclosure }
  | {
      type: 'done'
      conversation: AiChatConversationSummary
      message: AiChatMessage
      confirmations: AiChatConfirmation[]
    }
  | { type: 'error'; message: string; assistantMessage?: AiChatMessage }

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

  const headers = new Headers(init.headers)
  headers.set('Accept', 'text/event-stream')
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  if (token) headers.set('Authorization', `Bearer ${token}`)

  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      credentials: 'include',
      headers,
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
  return streamAiChatRequest(
    token,
    `/api/v1/ai-chat/conversations/${id}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        content,
        context: options.context,
        regenerateAssistantMessageId: options.regenerateAssistantMessageId,
      }),
    },
    onEvent,
    options.signal
  )
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

export async function cancelAiAgentAction(
  token: string | null,
  conversationId: number,
  confirmationId: number
) {
  const response = await apiRequest<AiChatPendingConfirmation>(
    `/api/v1/ai-chat/conversations/${conversationId}/confirmations/${confirmationId}/cancel`,
    {
      ...authOptions(token),
      method: 'POST',
    }
  )
  return readItem(response)
}
