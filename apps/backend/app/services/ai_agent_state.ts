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

  const hasActiveSummary = !!(input.summary && input.summaryUntilMessageId)
  const recentSource = hasActiveSummary ? messagesAfterSummary : input.messages
  const recentMessages = recentSource.slice(-input.recentMessageCount)
  const olderMessages = hasActiveSummary
    ? messagesAfterSummary.slice(
        0,
        Math.max(0, messagesAfterSummary.length - recentMessages.length)
      )
    : input.messages.slice(0, Math.max(0, input.messages.length - recentMessages.length))

  return { messages: recentMessages, messagesToSummarize: olderMessages }
}
