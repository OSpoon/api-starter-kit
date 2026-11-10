import type { AgentSessionState } from '#ai/agent'
import { restoreAgentSessionState } from '#ai/agent'
import type { AiChatResolvedRegeneration } from '#ai/chat/ai_chat_regeneration'
import type { AiAgentMessage } from '#ai/core/ai_agent_types'
import type AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage from '#models/ai_chat_message'

export type AiChatTurnContext = {
  history: AiAgentMessage[]
  agentContext?: AgentSessionState
}

export function buildAiChatHistoryQuery(
  conversationId: number,
  summaryBoundary: number | null | undefined
) {
  const query = AiChatMessage.query().where('conversation_id', conversationId)
  if (summaryBoundary !== null && summaryBoundary !== undefined) {
    query.where('id', '>', summaryBoundary)
  }
  return query.orderBy('id', 'asc')
}

export async function buildAiChatTurnContext(input: {
  conversation: AiChatConversation
  userMessage: AiChatMessage
  regeneration: AiChatResolvedRegeneration<AiChatMessage> | null
}): Promise<AiChatTurnContext> {
  const { conversation, userMessage, regeneration } = input
  const summaryBoundary = conversation.contextSummaryMessageId ?? null
  const historyMessages = regeneration
    ? regeneration.messages.filter(
        (message) => summaryBoundary === null || message.id > summaryBoundary
      )
    : await buildAiChatHistoryQuery(conversation.id, summaryBoundary)
  const history = [
    ...historyMessages
      .filter(
        (message) =>
          message.id !== userMessage.id && (message.role !== 'assistant' || message.content.trim())
      )
      .map((message) => ({
        role: message.role,
        content: message.content,
        id: message.id,
        ...(message.imageData && message.imageMimeType
          ? {
              image: {
                data: message.imageData.toString('base64'),
                mimeType: message.imageMimeType,
              },
            }
          : {}),
      })),
    {
      role: userMessage.role,
      content: userMessage.content,
      id: userMessage.id,
      ...(userMessage.imageData && userMessage.imageMimeType
        ? {
            image: {
              data: userMessage.imageData.toString('base64'),
              mimeType: userMessage.imageMimeType,
            },
          }
        : {}),
    },
  ]
  const contextSourceMessages = regeneration ? regeneration.messages : historyMessages
  const previousAgentContext = contextSourceMessages.findLast(
    (message) => message.role === 'assistant' && message.agentContext
  )?.agentContext
  const agentContext = restoreAgentSessionState(
    previousAgentContext,
    conversation.contextSummary ? summaryBoundary : null
  )

  return { history, agentContext }
}
