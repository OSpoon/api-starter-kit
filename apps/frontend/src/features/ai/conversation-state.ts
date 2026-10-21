import type { AiChatMessage } from './api'

export function hasAiChatConversationContent(messages: Array<{ content: string }>) {
  return messages.some((message) => message.content.trim().length > 0)
}

export function mergeAiChatMessages(...groups: AiChatMessage[][]) {
  const unique = new Map<number, AiChatMessage>()
  for (const message of groups.flat()) unique.set(message.id, message)
  return [...unique.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
}
