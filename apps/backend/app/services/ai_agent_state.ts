export type AiAgentConversationMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export function createAiAgentThreadId(userId: number, conversationId: number) {
  return `ai-chat:${userId}:${conversationId}`
}

/**
 * A new LangGraph thread is seeded once from persisted product history. Later
 * turns send only the new message so checkpointed state is never duplicated.
 */
export function createAiAgentInputMessages(
  history: AiAgentConversationMessage[],
  latestUserMessage: AiAgentConversationMessage,
  hasCheckpoint: boolean
) {
  return hasCheckpoint ? [latestUserMessage] : [...history, latestUserMessage]
}
