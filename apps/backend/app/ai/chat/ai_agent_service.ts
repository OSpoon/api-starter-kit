import crypto from 'node:crypto'

import logger from '@adonisjs/core/services/logger'

import { listConversationConfirmations } from '#ai/core/ai_agent_confirmation'
import { serializeAiAgentRuntimeContext } from '#ai/core/ai_agent_runtime_context'
import type { AiAgentToolRequestContext } from '#ai/core/ai_agent_tool_context'
import type { AiAgentMessage } from '#ai/core/ai_agent_types'
import type { AiAgentPageContext } from '#ai/policy/ai_agent_prompt_policy'
import { getPendingAiQueryContext } from '#ai/registry/ai_agent_query_registry'
import type { PiModelUsage } from '#ai/runtime/ai_agent_pi_runtime'
import { createAiAgentPiStream } from '#ai/runtime/ai_agent_pi_stream'
import { registerAiAgentRun } from '#ai/runtime/ai_agent_run_registry'
import {
  exportAiAgentTraceToLangfuse,
  hasLangfuseTelemetryDestination,
} from '#ai/runtime/ai_agent_telemetry_exporter'
import AiChatConversation from '#models/ai_chat_conversation'
import { recordAiUsageEvent } from '#services/ai_usage_service'

export {
  getAiAgentModelName,
  getAiAgentSummarizationOptions,
  getAiRequestTimeout,
} from '#ai/core/ai_agent_config'
export type { AiAgentMessage } from '#ai/core/ai_agent_types'
export {
  type AiAgentPageContext,
  createAiAgentSystemPrompt,
} from '#ai/policy/ai_agent_prompt_policy'

async function buildLiveSessionContext(conversationId: number, userId: number) {
  try {
    const runtimeContext = `\nServer-generated runtime context (JSON): ${serializeAiAgentRuntimeContext()}`
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
    return `${runtimeContext}${summaryContext} ${pendingQueryContext} ${pendingConfirmationContext}`
  } catch {
    return `\nServer-generated runtime context (JSON): ${serializeAiAgentRuntimeContext()}`
  }
}

export async function createAiAgentStream(
  input: AiAgentToolRequestContext & {
    messages: AiAgentMessage[]
    context?: AiAgentPageContext
    onCompactionUsage?: (usage: PiModelUsage) => void
  }
) {
  const agentRunId = crypto.randomUUID()
  let callSequence = 0
  const nextModelCallSequence = () => callSequence++
  const liveSessionContext = await buildLiveSessionContext(input.conversationId, input.userId)
  const persistCompaction = async (summary: string) => {
    await AiChatConversation.query()
      .where('id', input.conversationId)
      .where('user_id', input.userId)
      .update({ context_summary: summary })
  }
  const stream = await createAiAgentPiStream({
    ...input,
    agentRunId,
    liveSessionContext,
    getLiveSessionContext: () => buildLiveSessionContext(input.conversationId, input.userId),
    onCompaction: persistCompaction,
    onCompactionUsage: async (usage) => {
      try {
        await recordAiUsageEvent({
          userId: input.userId,
          conversationId: input.conversationId,
          agentRunId,
          callSequence: nextModelCallSequence(),
          providerId: usage.providerId,
          modelId: usage.modelId,
          baseUrl: usage.baseUrl,
          usage: {
            input: usage.usage.input,
            output: usage.usage.output,
            cacheRead: usage.usage.cacheRead,
            cacheWrite: usage.usage.cacheWrite,
            totalTokens: usage.usage.totalTokens,
          },
          status: usage.status,
        })
      } catch (error) {
        logger.warn(
          { err: error, conversationId: input.conversationId, agentRunId },
          'AI compaction usage event could not be recorded'
        )
      }
      try {
        input.onCompactionUsage?.(usage)
      } catch (error) {
        logger.warn(
          { err: error, conversationId: input.conversationId, agentRunId },
          'AI compaction usage could not be added to the turn summary'
        )
      }
    },
  })
  registerAiAgentRun({
    conversationId: input.conversationId,
    userId: input.userId,
    agentRunId,
    control: stream.control,
  })
  const telemetryStore = stream.telemetryStore
  if (hasLangfuseTelemetryDestination() && telemetryStore) {
    const logTelemetryTrace = async () => {
      try {
        const { traces } = await telemetryStore.findTraces({ limit: 1 })
        const trace = traces[0]
        if (!trace) return

        logger.debug({ agentRunId, spanCount: trace.spans.length }, 'AI agent telemetry trace')
        await exportAiAgentTraceToLangfuse(trace, input.conversationId)
      } catch (error) {
        logger.warn({ err: error, agentRunId }, 'AI agent telemetry trace could not be exported')
      }
    }
    void stream.completion.then(logTelemetryTrace, logTelemetryTrace)
  }
  return {
    stream,
    agentRunId,
    model: stream.model,
    models: stream.models,
    nextModelCallSequence,
    toolLabels: stream.toolLabels,
  }
}
