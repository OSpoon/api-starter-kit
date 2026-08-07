export type AiChatRegenerationMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
}

export type AiChatResolvedRegeneration<T extends AiChatRegenerationMessage> = {
  assistantMessage: T
  userMessage: T
  messages: T[]
}

export function resolveAiChatRegeneration<T extends AiChatRegenerationMessage>(
  messages: T[],
  assistantMessageId: number
): AiChatResolvedRegeneration<T> | null {
  const assistantMessage = messages.at(-1)
  const userMessage = messages.at(-2)

  if (
    !assistantMessage ||
    assistantMessage.id !== assistantMessageId ||
    assistantMessage.role !== 'assistant' ||
    !userMessage ||
    userMessage.role !== 'user'
  ) {
    return null
  }

  return {
    assistantMessage,
    userMessage,
    messages: messages.slice(0, -1),
  }
}
