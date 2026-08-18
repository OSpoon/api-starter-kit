export function hasAiChatConversationContent(messages: Array<{ content: string }>) {
  return messages.some((message) => message.content.trim().length > 0)
}
