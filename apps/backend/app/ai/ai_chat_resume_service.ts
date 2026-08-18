import AiChatMessage from '#models/ai_chat_message'

export async function hasAiChatResumeCandidate(conversationId: number) {
  const latestMessages = await AiChatMessage.query()
    .where('conversation_id', conversationId)
    .orderBy('created_at', 'desc')
    .limit(2)
  const latest = latestMessages[0]
  const previous = latestMessages[1]

  return latest?.role === 'user' || (latest?.role === 'assistant' && previous?.role === 'user')
}
