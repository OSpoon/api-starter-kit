import type { AiChatMessage } from './api'

type AiChatMessageContent = {
  content: string
  image?: unknown
  localImageFile?: unknown
}

export function hasAiChatMessageContent(message: AiChatMessageContent) {
  return Boolean(message.content.trim() || message.image || message.localImageFile)
}

export function hasAiChatConversationContent(messages: AiChatMessageContent[]) {
  return messages.some(hasAiChatMessageContent)
}

export function mergeAiChatMessages(...groups: AiChatMessage[][]) {
  const unique = new Map<number, AiChatMessage>()
  for (const message of groups.flat()) unique.set(message.id, message)
  return [...unique.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
}
