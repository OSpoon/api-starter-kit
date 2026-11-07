import type { AgentMessage } from '@earendil-works/pi-agent-core'

type SessionMessage = Extract<AgentMessage, { role: 'user' | 'assistant' | 'toolResult' }> & {
  sourceMessageId?: number
  isContextSummary?: boolean
}

type ChatMessage = { id: number; role: 'user' | 'assistant'; content: string }
const maxSessionToolResultChars = 20_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isSessionMessage(value: unknown): value is SessionMessage {
  if (!isRecord(value) || !['user', 'assistant', 'toolResult'].includes(String(value.role))) {
    return false
  }
  if (typeof value.timestamp !== 'number') return false
  if (value.role === 'toolResult') {
    return (
      Array.isArray(value.content) &&
      typeof value.toolName === 'string' &&
      typeof value.toolCallId === 'string'
    )
  }
  if (value.role === 'assistant') {
    return (
      Array.isArray(value.content) &&
      typeof value.api === 'string' &&
      typeof value.provider === 'string' &&
      typeof value.model === 'string' &&
      typeof value.stopReason === 'string' &&
      isRecord(value.usage)
    )
  }
  return typeof value.content === 'string' || Array.isArray(value.content)
}

function redactSensitiveText(value: string) {
  return value
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(
      /\b(password|secret|token|authorization|api[\s_-]?key|cookie|webhook)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '$1$2[redacted]'
    )
}

function redactSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveFields)
  if (typeof value === 'string') return redactSensitiveText(value)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /password|secret|token|api.?key|credential|authorization|webhook/i.test(key)
        ? '[redacted]'
        : redactSensitiveFields(item),
    ])
  )
}

function redactToolText(value: string) {
  try {
    return JSON.stringify(redactSensitiveFields(JSON.parse(value)))
  } catch {
    return redactSensitiveText(value)
  }
}

function copySafeMessage(message: SessionMessage): SessionMessage {
  const copy = JSON.parse(JSON.stringify(message)) as SessionMessage
  if (copy.role === 'assistant' && Array.isArray(copy.content)) {
    copy.content = copy.content
      .filter((part) => !isRecord(part) || part.type !== 'thinking')
      .map((part) => redactSensitiveFields(part)) as typeof copy.content
  } else if (copy.role === 'toolResult') {
    copy.content = copy.content.map((part) => {
      if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') {
        return { ...part, text: redactToolText(part.text) }
      }
      return redactSensitiveFields(part)
    }) as typeof copy.content
  }
  return copy
}

export function upsertAiAgentToolResult(
  value: unknown,
  input: {
    assistantMessageId: number
    toolCallId: string
    toolName: string
    text: string
    isError: boolean
  }
) {
  const messages = restoreAiAgentSessionContext(value)
  const text =
    input.text.length > maxSessionToolResultChars
      ? `${input.text.slice(0, maxSessionToolResultChars)}\n[结果已截断]`
      : input.text
  const result = copySafeMessage({
    role: 'toolResult',
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    content: [{ type: 'text', text }],
    isError: input.isError,
    timestamp: Date.now(),
    sourceMessageId: input.assistantMessageId,
  })
  const existingIndex = messages.findIndex(
    (message) => message.role === 'toolResult' && message.toolCallId === input.toolCallId
  )
  if (existingIndex >= 0) messages[existingIndex] = result
  else messages.push(result)
  return messages
}

function getUserText(message: SessionMessage) {
  if (message.role !== 'user') return undefined
  if (typeof message.content === 'string') return message.content
  return message.content
    .filter((part) => isRecord(part) && part.type === 'text' && typeof part.text === 'string')
    .map((part) => (part as { text: string }).text)
    .join('')
}

function getAssistantIdForUser(chatMessages: ChatMessage[], userId: number) {
  const userIndex = chatMessages.findIndex((message) => message.id === userId)
  if (userIndex < 0) return undefined
  const nextUserIndex = chatMessages.findIndex(
    (message, index) => index > userIndex && message.role === 'user'
  )
  const assistant = chatMessages
    .slice(userIndex + 1, nextUserIndex < 0 ? undefined : nextUserIndex)
    .find((message) => message.role === 'assistant')
  return assistant?.id
}

export function restoreAiAgentSessionContext(
  value: unknown,
  coveredThroughMessageId?: number | null
) {
  if (!Array.isArray(value)) return []
  return value.filter(isSessionMessage).filter((message) => {
    if (message.isContextSummary) return false
    if (coveredThroughMessageId && message.sourceMessageId !== undefined) {
      return message.sourceMessageId > coveredThroughMessageId
    }
    return true
  })
}

export function snapshotAiAgentSessionContext(
  messages: AgentMessage[],
  chatMessages: ChatMessage[],
  fallbackAssistantId: number
) {
  const availableUserIds = new Map<string, number[]>([])
  for (const message of chatMessages) {
    if (message.role !== 'user') continue
    const ids = availableUserIds.get(message.content) ?? []
    ids.push(message.id)
    availableUserIds.set(message.content, ids)
  }

  const usedUserIds = new Set<number>()
  let currentUserId: number | undefined
  const snapshot: SessionMessage[] = []
  for (const message of messages) {
    if (!isSessionMessage(message)) continue
    if (message.isContextSummary) continue
    const copy = copySafeMessage(message)
    if (copy.role === 'user') {
      let sourceMessageId =
        Number.isSafeInteger(copy.sourceMessageId) && copy.sourceMessageId! > 0
          ? copy.sourceMessageId
          : undefined
      if (!sourceMessageId) {
        const match = availableUserIds
          .get(getUserText(copy) ?? '')
          ?.find((id) => !usedUserIds.has(id))
        sourceMessageId = match
      }
      if (!sourceMessageId) continue
      usedUserIds.add(sourceMessageId)
      currentUserId = sourceMessageId
      copy.sourceMessageId = sourceMessageId
      snapshot.push(copy)
      continue
    }

    const existingSourceId =
      Number.isSafeInteger(copy.sourceMessageId) && copy.sourceMessageId! > 0
        ? copy.sourceMessageId
        : undefined
    copy.sourceMessageId =
      existingSourceId ??
      (currentUserId ? getAssistantIdForUser(chatMessages, currentUserId) : undefined) ??
      fallbackAssistantId
    snapshot.push(copy)
  }
  return snapshot
}
