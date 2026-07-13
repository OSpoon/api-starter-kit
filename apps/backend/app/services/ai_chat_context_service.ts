export type AiChatContextRole = 'user' | 'assistant'

export interface AiChatContextMessage {
  id: number
  role: AiChatContextRole
  content: string
}

export interface AiChatContextState {
  summary: string | null
  summaryUntilMessageId: number | null
}

export interface AiChatCompressionOptions {
  enabled: boolean
  thresholdTokens: number
  recentMessageCount: number
  historyMessageLimit: number
  summarize: (input: {
    previousSummary: string | null
    messages: AiChatContextMessage[]
  }) => Promise<string>
}

export interface AiChatRequestMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AiChatContextResult {
  messages: AiChatRequestMessage[]
  state: AiChatContextState
  didCompress: boolean
}

export function estimateAiChatTokens(content: string) {
  // This conservative estimate works predictably across CJK and Latin text without provider tokenizers.
  return Math.max(1, Math.ceil(content.trim().length / 2))
}

function createSummaryMessage(summary: string): AiChatRequestMessage {
  return {
    role: 'system',
    content: `Conversation summary from earlier messages. Treat it as factual context and continue the conversation naturally.\n\n${summary}`,
  }
}

function createFallbackContext(
  pendingMessages: AiChatContextMessage[],
  state: AiChatContextState,
  historyMessageLimit: number
): AiChatContextResult {
  const recentMessages = pendingMessages.slice(-historyMessageLimit)
  const messages: AiChatRequestMessage[] = state.summary
    ? [createSummaryMessage(state.summary), ...recentMessages]
    : recentMessages

  return {
    messages,
    state,
    didCompress: false,
  }
}

export async function buildAiChatContext(
  allMessages: AiChatContextMessage[],
  state: AiChatContextState,
  options: AiChatCompressionOptions
): Promise<AiChatContextResult> {
  const hasPersistedSummary = Boolean(state.summary && state.summaryUntilMessageId)
  const pendingMessages = hasPersistedSummary
    ? allMessages.filter((message) => message.id > state.summaryUntilMessageId!)
    : allMessages

  if (!options.enabled) {
    return createFallbackContext(pendingMessages, state, options.historyMessageLimit)
  }

  const estimatedTokens =
    (state.summary ? estimateAiChatTokens(state.summary) : 0) +
    pendingMessages.reduce((total, message) => total + estimateAiChatTokens(message.content), 0)
  const requiresCompression =
    pendingMessages.length > options.historyMessageLimit ||
    estimatedTokens > options.thresholdTokens
  const retainedMessageCount = Math.max(1, options.recentMessageCount)
  const messagesToSummarize = requiresCompression
    ? pendingMessages.slice(0, -retainedMessageCount)
    : []

  if (messagesToSummarize.length === 0) {
    const messages: AiChatRequestMessage[] = state.summary
      ? [createSummaryMessage(state.summary), ...pendingMessages]
      : pendingMessages

    return {
      messages,
      state,
      didCompress: false,
    }
  }

  try {
    const generatedSummary = await options.summarize({
      previousSummary: state.summary,
      messages: messagesToSummarize,
    })
    const summary = generatedSummary.trim()

    if (!summary) {
      throw new Error('AI conversation summary is empty')
    }

    const summaryUntilMessageId = messagesToSummarize.at(-1)!.id
    const recentMessages = pendingMessages.filter((message) => message.id > summaryUntilMessageId)

    return {
      messages: [createSummaryMessage(summary), ...recentMessages],
      state: {
        summary,
        summaryUntilMessageId,
      },
      didCompress: true,
    }
  } catch {
    return createFallbackContext(pendingMessages, state, options.historyMessageLimit)
  }
}
