import crypto from 'node:crypto'

import { listConversationConfirmations } from '#ai/ai_agent_confirmation'
import { createAiAgentPiStream } from '#ai/ai_agent_pi_stream'
import type { AiAgentPageContext } from '#ai/ai_agent_prompt_policy'
import { getPendingAiQueryContext } from '#ai/ai_agent_query_registry'
import { registerAiAgentRun } from '#ai/ai_agent_run_registry'
import type { AiAgentToolRequestContext } from '#ai/ai_agent_tool_context'
import type { AiAgentMessage } from '#ai/ai_agent_types'
import AiChatConversation from '#models/ai_chat_conversation'

export {
  getAiAgentModelName,
  getAiAgentSummarizationOptions,
  getAiRequestTimeout,
} from '#ai/ai_agent_config'
export { type AiAgentPageContext, createAiAgentSystemPrompt } from '#ai/ai_agent_prompt_policy'
export type { AiAgentMessage } from '#ai/ai_agent_types'

async function buildLiveSessionContext(conversationId: number, userId: number) {
  try {
    const conversation = await AiChatConversation.query()
      .where('id', conversationId)
      .where('user_id', userId)
      .select(['context_summary'])
      .first()
    const pendingQueryContext = await getPendingAiQueryContext({ conversationId, userId })
    const confirmations = await listConversationConfirmations(conversationId, userId)
    const pendingConfirmationContext = `<pending-confirmations>${JSON.stringify(
      confirmations.map((confirmation) => ({
        id: confirmation.id,
        action: confirmation.action,
        targetType: confirmation.targetType,
        targetId: confirmation.targetId,
        targetSummary: confirmation.targetSummary,
      }))
    )}</pending-confirmations>`
    const summaryContext = conversation?.contextSummary
      ? `<conversation-summary>${conversation.contextSummary}</conversation-summary>`
      : ''
    return `${summaryContext} ${pendingQueryContext} ${pendingConfirmationContext}`
  } catch {
    return ''
  }
}

export async function createAiAgentStream(
  input: AiAgentToolRequestContext & {
    messages: AiAgentMessage[]
    context?: AiAgentPageContext
  }
) {
  const agentRunId = crypto.randomUUID()
  const liveSessionContext = await buildLiveSessionContext(input.conversationId, input.userId)
  const persistCompaction = async (summary: string) => {
    await AiChatConversation.query()
      .where('id', input.conversationId)
      .where('user_id', input.userId)
      .update({ context_summary: summary })
  }
  const stream = createAiAgentPiStream({
    ...input,
    agentRunId,
    liveSessionContext,
    getLiveSessionContext: () => buildLiveSessionContext(input.conversationId, input.userId),
    onCompaction: persistCompaction,
  })
  registerAiAgentRun({
    conversationId: input.conversationId,
    userId: input.userId,
    agentRunId,
    control: stream.control,
  })
  return { stream, agentRunId }
}
