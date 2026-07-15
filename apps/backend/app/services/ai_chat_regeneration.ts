export type AiChatRegenerationMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
}

export function resolveAiChatRegeneration<T extends AiChatRegenerationMessage>(
  messages: T[],
  assistantMessageId: number
) {
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
