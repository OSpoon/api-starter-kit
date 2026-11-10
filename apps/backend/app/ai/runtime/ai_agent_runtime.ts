import type {
  AgentEngine,
  AgentEvent,
  AgentModelConfig,
  AgentModelUsage,
  AgentSession,
} from '@api-starter-kit/ai-agent'
import { piAgentEngine } from '@api-starter-kit/ai-agent/pi'

import { getAiAgentSummarizationOptions } from '#ai/core/ai_agent_config'
import type { AiAgentToolRequestContext } from '#ai/core/ai_agent_tool_context'
import {
  isAiAgentReadTool,
  isAiAgentTerminalToolResult,
  isRecoverableAiAgentReadToolError,
  maxConsecutiveAiAgentReadToolFailures,
} from '#ai/core/ai_agent_tool_errors'
import type { AiAgentMessage } from '#ai/core/ai_agent_types'
import type { AiAgentPageContext } from '#ai/policy/ai_agent_prompt_policy'
import { aiAgentSummaryPrompt, createAiAgentSystemPrompt } from '#ai/policy/ai_agent_prompt_policy'
import { createConfiguredAiAgentTools } from '#ai/registry/ai_agent_tool_registry'
import { isAiTelemetryEnabled } from '#ai/runtime/ai_agent_telemetry_exporter'
import { listEnabledAiAgentSkills } from '#services/ai_agent_skill_service'
import { readRuntimeLlmConfiguration } from '#services/llm_configuration_service'
import { resolveModelsDevPricing } from '#services/models_dev_pricing_service'

export function getAiAgentEngine(): AgentEngine {
  return piAgentEngine
}

export function shouldStopAgentAfterTurn(
  input: {
    stopReason: string
    toolResults: Array<{ toolName: string; details?: unknown }>
    hasQueuedMessages: boolean
  },
  readToolFailureLimitReached = false
) {
  if (input.stopReason === 'error' || input.stopReason === 'aborted') return true
  if (input.hasQueuedMessages) return false
  if (readToolFailureLimitReached) return true
  return (
    input.toolResults.length > 0 &&
    input.toolResults.every((result) =>
      isAiAgentTerminalToolResult(result.toolName, result.details)
    )
  )
}

export async function getAiAgentModelConfig(): Promise<AgentModelConfig> {
  const config = await readRuntimeLlmConfiguration()
  const modelId = config.chat.model
  const baseUrl = config.chat.baseURL ?? 'https://api.openai.com/v1'
  const pricing = await resolveModelsDevPricing(modelId, baseUrl)
  return {
    providerId: 'api-starter-openai',
    modelId,
    baseUrl,
    apiKey: config.chat.apiKey,
    contextWindow: config.chat.contextWindow,
    maxTokens: config.chat.maxTokens,
    reasoning: config.chat.reasoningLevel !== 'off',
    reasoningLevel: config.chat.reasoningLevel,
    cost: pricing?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }
}

export async function createAiAgentRuntime(
  input: AiAgentToolRequestContext & {
    messages: AiAgentMessage[]
    agentContext?: unknown
    context?: AiAgentPageContext
    liveSessionContext?: string
    contextSummary?: string | null
    contextSummaryMessageId?: number | null
    getLiveSessionContext?: () => Promise<string | undefined>
    agentRunId: string
    finalResponseOnly?: boolean
    onCompaction?: (summary: string, coveredThroughMessageId: number) => Promise<void>
    onCompactionUsage?: (usage: AgentModelUsage) => void | Promise<void>
  }
): Promise<AgentSession> {
  const lastMessage = input.messages.at(-1)
  const history = lastMessage?.role === 'user' ? input.messages.slice(0, -1) : input.messages
  const summaryOptions = getAiAgentSummarizationOptions()
  let consecutiveReadToolFailures = 0
  const [availableSkills, model] = await Promise.all([
    input.capabilityMode === 'knowledge-only' || input.enabledToolNames?.length === 0
      ? Promise.resolve([])
      : listEnabledAiAgentSkills(),
    getAiAgentModelConfig(),
  ])

  return getAiAgentEngine().createSession({
    model,
    systemPrompt: createAiAgentSystemPrompt(
      input.context,
      '',
      input.capabilityMode,
      availableSkills,
      input.finalResponseOnly
    ),
    tools: async (emit: (event: AgentEvent) => void) =>
      createConfiguredAiAgentTools({
        ...input,
        agentRunId: input.agentRunId,
        onTaskPlanUpdate: (steps) => emit({ type: 'task_plan_updated', steps }),
      }),
    messages: history,
    sessionState: input.agentContext,
    ...(lastMessage?.role === 'user'
      ? { initialPrompt: lastMessage.content, initialPromptMessageId: lastMessage.id }
      : {}),
    sessionId: `ai-chat:${input.conversationId}`,
    signal: input.signal,
    runtimeContext: {
      initialValue: input.liveSessionContext,
      refresh: input.getLiveSessionContext,
    },
    summary: {
      text: input.contextSummary,
      coveredThroughMessageId: input.contextSummaryMessageId,
      enabled: summaryOptions.enabled,
      maxInputTokens: summaryOptions.maxInputTokens,
      maxOutputTokens: summaryOptions.maxOutputTokens,
      prompt: aiAgentSummaryPrompt,
      save: input.onCompaction,
      onUsage: input.onCompactionUsage,
    },
    telemetry: { enabled: isAiTelemetryEnabled() },
    shouldStopAfterTurn: ({ stopReason, toolResults, hasQueuedMessages }) =>
      shouldStopAgentAfterTurn(
        { stopReason, toolResults, hasQueuedMessages },
        consecutiveReadToolFailures >= maxConsecutiveAiAgentReadToolFailures
      ),
    afterToolCall: ({ toolName, result }) => {
      const isReadFailure = isRecoverableAiAgentReadToolError(toolName, result.details)
      if (isReadFailure) consecutiveReadToolFailures += 1
      else if (isAiAgentReadTool(toolName)) consecutiveReadToolFailures = 0
      return {
        terminate:
          isAiAgentTerminalToolResult(toolName, result.details) ||
          consecutiveReadToolFailures >= maxConsecutiveAiAgentReadToolFailures,
      }
    },
  })
}
