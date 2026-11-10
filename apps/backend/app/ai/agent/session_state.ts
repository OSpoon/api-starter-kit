import type { AgentContentPart, AgentSessionMessage, AgentSessionState } from './agent.js'

type ChatMessage = { id: number; role: 'user' | 'assistant'; content: string }
const maxToolResultChars = 20_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isSessionMessage(value: unknown): value is AgentSessionMessage {
  if (
    !isRecord(value) ||
    !['system', 'user', 'assistant', 'toolResult'].includes(String(value.role)) ||
    typeof value.timestamp !== 'number'
  ) {
    return false
  }
  if (value.role === 'toolResult') {
    return (
      Array.isArray(value.content) &&
      typeof value.toolName === 'string' &&
      typeof value.toolCallId === 'string'
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

function copySafeMessage(message: AgentSessionMessage): AgentSessionMessage {
  const copy = JSON.parse(JSON.stringify(message)) as AgentSessionMessage
  if (copy.role === 'assistant' && Array.isArray(copy.content)) {
    copy.content = copy.content
      .filter((part) => !isRecord(part) || part.type !== 'thinking')
      .map((part) => redactSensitiveFields(part)) as AgentContentPart[]
  } else if (copy.role === 'toolResult' && Array.isArray(copy.content)) {
    copy.content = copy.content.map((part) => {
      if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') {
        return { ...part, text: redactToolText(part.text) }
      }
      return redactSensitiveFields(part)
    }) as AgentContentPart[]
  } else if (copy.role === 'user' && Array.isArray(copy.content)) {
    copy.content = copy.content.filter((part) => !isRecord(part) || part.type !== 'image')
  }
  return copy
}

export function restoreAgentSessionState(
  value: unknown,
  coveredThroughMessageId?: number | null,
  legacyEngineId = 'pi'
): AgentSessionState {
  const engineId =
    isRecord(value) && value.version === 1 && typeof value.engineId === 'string'
      ? value.engineId
      : legacyEngineId
  const rawMessages = Array.isArray(value) ? value : isRecord(value) ? value.messages : undefined
  const messages = Array.isArray(rawMessages)
    ? rawMessages.filter(isSessionMessage).filter((message) => {
        if (message.isContextSummary) return false
        if (coveredThroughMessageId && message.sourceMessageId !== undefined) {
          return message.sourceMessageId > coveredThroughMessageId
        }
        return true
      })
    : []
  return { engineId, version: 1, messages }
}

export function upsertAgentToolResult(
  value: unknown,
  input: {
    assistantMessageId: number
    toolCallId: string
    toolName: string
    text: string
    isError: boolean
  }
) {
  const state = restoreAgentSessionState(value)
  const text =
    input.text.length > maxToolResultChars
      ? `${input.text.slice(0, maxToolResultChars)}\n[结果已截断]`
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
  const existingIndex = state.messages.findIndex(
    (message) => message.role === 'toolResult' && message.toolCallId === input.toolCallId
  )
  if (existingIndex >= 0) state.messages[existingIndex] = result
  else state.messages.push(result)
  return state
}

function getUserText(message: AgentSessionMessage) {
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

export function createFinalResponseState(value: unknown, userMessageId: number) {
  const state = restoreAgentSessionState(value)
  const userIndex = state.messages.findLastIndex(
    (message) => message.role === 'user' && message.sourceMessageId === userMessageId
  )
  if (userIndex < 0) return state

  const finalDraftIndex = state.messages.findLastIndex(
    (message, index) =>
      index > userIndex &&
      message.role === 'assistant' &&
      !(
        Array.isArray(message.content) &&
        message.content.some((part) => isRecord(part) && part.type === 'toolCall')
      )
  )
  if (finalDraftIndex >= 0) state.messages.splice(finalDraftIndex, 1)
  state.messages.splice(userIndex, 1)
  for (const message of state.messages) {
    if (message.role === 'user' && Array.isArray(message.content)) {
      message.content = message.content.filter((part) => !isRecord(part) || part.type !== 'image')
    }
  }
  return state
}

export function snapshotAgentSessionState(
  value: unknown,
  chatMessages: ChatMessage[],
  fallbackAssistantId: number
) {
  const state = restoreAgentSessionState(value)
  const availableUserIds = new Map<string, number[]>()
  for (const message of chatMessages) {
    if (message.role !== 'user') continue
    const ids = availableUserIds.get(message.content) ?? []
    ids.push(message.id)
    availableUserIds.set(message.content, ids)
  }

  const usedUserIds = new Set<number>()
  let currentUserId: number | undefined
  const snapshot: AgentSessionMessage[] = []
  for (const message of state.messages) {
    if (message.isContextSummary) continue
    const copy = copySafeMessage(message)
    if (copy.role === 'user') {
      let sourceMessageId =
        Number.isSafeInteger(copy.sourceMessageId) && copy.sourceMessageId! > 0
          ? copy.sourceMessageId
          : undefined
      if (!sourceMessageId) {
        sourceMessageId = availableUserIds
          .get(getUserText(copy) ?? '')
          ?.find((id) => !usedUserIds.has(id))
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
  return { ...state, messages: snapshot }
}
