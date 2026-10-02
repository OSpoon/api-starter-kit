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
  const assistantIndex = messages.findIndex((message) => message.id === assistantMessageId)
  const latestAssistantIndex = messages.findLastIndex((message) => message.role === 'assistant')
  const assistantMessage = messages[assistantIndex]
  const userIndex = messages.findLastIndex(
    (message, index) => index < assistantIndex && message.role === 'user'
  )
  const userMessage = messages[userIndex]

  if (
    !assistantMessage ||
    assistantIndex !== latestAssistantIndex ||
    assistantMessage.role !== 'assistant' ||
    !userMessage ||
    userMessage.role !== 'user'
  ) {
    return null
  }

  return {
    assistantMessage,
    userMessage,
    // Keep the selected prompt last for the Pi runtime. Assistant segments
    // persisted after queued user messages are excluded from the regenerated
    // model context without being deleted from conversation history.
    messages: messages.slice(0, userIndex + 1),
  }
}
