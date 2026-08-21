import AiAgentPendingQuery from '#models/ai_agent_pending_query'

/**
 * Clears application-level pending query state when a conversation turn is
 * regenerated or discarded.
 */
export async function resetAiConversationState(input: { conversationId: number; userId: number }) {
  await AiAgentPendingQuery.query()
    .where('conversation_id', input.conversationId)
    .where('requested_by_user_id', input.userId)
    .where('status', 'collecting_parameters')
    .update({ status: 'cancelled' })
}
