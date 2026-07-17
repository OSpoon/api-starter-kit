export type AiAgentConversationMessage = {
  id?: number
  role: 'user' | 'assistant' | 'system'
  content: string
}

export function estimateAiMessageTokens(messages: AiAgentConversationMessage[]) {
  return messages.reduce((total, message) => total + Math.ceil(message.content.length / 4) + 4, 0)
}

export function selectAiAgentContext(input: {
  messages: AiAgentConversationMessage[]
  summary: string | null
  summaryUntilMessageId: number | null
  thresholdTokens: number
  recentMessageCount: number
}) {
  const messagesAfterSummary =
    input.summary && input.summaryUntilMessageId
      ? input.messages.filter((message) => (message.id ?? 0) > input.summaryUntilMessageId!)
      : input.messages
  const contextWithSummary = input.summary
    ? [
        { role: 'system' as const, content: `Persisted conversation summary:\n${input.summary}` },
        ...messagesAfterSummary,
      ]
    : messagesAfterSummary

  if (estimateAiMessageTokens(contextWithSummary) <= input.thresholdTokens) {
    return { messages: contextWithSummary, messagesToSummarize: [] as AiAgentConversationMessage[] }
  }

  const recentMessages = input.messages.slice(-input.recentMessageCount)
  const messagesToSummarize =
    input.summary && input.summaryUntilMessageId
      ? messagesAfterSummary.slice(
          0,
          Math.max(messagesAfterSummary.length - recentMessages.length, 0)
        )
      : input.messages.slice(0, Math.max(input.messages.length - recentMessages.length, 0))

  return { messages: recentMessages, messagesToSummarize }
}
