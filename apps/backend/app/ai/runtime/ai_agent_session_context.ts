import type { AgentMessage } from '@earendil-works/pi-agent-core'

import { builtInAiAgentToolNames } from '#ai/core/ai_agent_tool_catalog'

type SessionMessage = Extract<AgentMessage, { role: 'user' | 'assistant' | 'toolResult' }> & {
  sourceMessageId?: number
  isContextSummary?: boolean
}

type ChatMessage = { id: number; role: 'user' | 'assistant'; content: string }

const knownToolNames = new Set<string>(builtInAiAgentToolNames)
const externalResultPlaceholder =
  'External tool output was omitted from saved context. Call the tool again if needed.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isSessionMessage(value: unknown): value is SessionMessage {
  if (!isRecord(value) || !['user', 'assistant', 'toolResult'].includes(String(value.role))) {
    return false
  }
  if (typeof value.timestamp !== 'number') return false
  if (typeof value.content !== 'string' && !Array.isArray(value.content)) return false
  if (value.role === 'toolResult') {
    return typeof value.toolName === 'string' && typeof value.toolCallId === 'string'
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
  return true
}

function redactSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveFields)
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

function copySafeMessage(message: SessionMessage): SessionMessage {
  const copy = JSON.parse(JSON.stringify(message)) as SessionMessage
  if (copy.role === 'assistant' && Array.isArray(copy.content)) {
    copy.content = copy.content
      .filter((part) => !isRecord(part) || part.type !== 'thinking')
      .map((part) => redactSensitiveFields(part)) as typeof copy.content
  } else if (copy.role === 'toolResult') {
    copy.content = knownToolNames.has(copy.toolName)
      ? copy.content.filter((part) => isRecord(part) && part.type === 'text')
      : [{ type: 'text', text: externalResultPlaceholder }]
  }
  return copy
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
