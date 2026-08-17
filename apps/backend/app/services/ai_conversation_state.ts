import AiAgentPendingQuery from '#models/ai_agent_pending_query'
import { clearAiAgentResumeState } from '#services/ai_agent_resume_state'

/**
 * Resets the Agent resume state and application-level pending query state.
 *
 * When these two states diverge — for example, a regeneration clears the
 * run state but leaves an `AiAgentPendingQuery` with `collecting_parameters`
 * status — the next request injects stale "missing parameters" context into
 * the system prompt while the graph state has already been discarded. This
 * function is the single entry point that clears both, preventing that
 * divergence at every call site that resets conversation state.
 */
export async function resetAiConversationState(input: { conversationId: number; userId: number }) {
  await Promise.all([
    clearAiAgentResumeState(input),
    AiAgentPendingQuery.query()
      .where('conversation_id', input.conversationId)
      .where('requested_by_user_id', input.userId)
      .where('status', 'collecting_parameters')
      .update({ status: 'cancelled' }),
  ])
}
