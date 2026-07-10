import type AiChatConversation from '#models/ai_chat_conversation'
import type AiChatMessage from '#models/ai_chat_message'

export function serializeAiChatMessage(message: AiChatMessage) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISO(),
    updatedAt: message.updatedAt.toISO(),
  }
}

export function serializeAiChatConversation(conversation: AiChatConversation) {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt.toISO(),
    updatedAt: conversation.updatedAt.toISO(),
  }
}

export function serializeAiChatConversationWithMessages(conversation: AiChatConversation) {
  return {
    ...serializeAiChatConversation(conversation),
    messages: conversation.messages.map(serializeAiChatMessage),
  }
}
