import AiChatMessage from '#models/ai_chat_message'

export async function hasAiAgentResumeState(input: { conversationId: number; userId: number }) {
  const latestMessages = await AiChatMessage.query()
    .where('conversation_id', input.conversationId)
    .orderBy('created_at', 'desc')
    .limit(2)
  const latest = latestMessages[0]
  const previous = latestMessages[1]
  return latest?.role === 'user' || (latest?.role === 'assistant' && previous?.role === 'user')
}

export async function getAiAgentResumeRunStage(input: {
  conversationId: number
  userId: number
}) {
  return (await hasAiAgentResumeState(input)) ? ('running' as const) : undefined
}

export async function clearAiAgentResumeState(_input: {
  conversationId: number
  userId: number
}) {
  // Pi state is reconstructed from persisted conversation messages.
}
