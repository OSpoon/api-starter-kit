import {
  Agent,
  type AgentLoopTurnUpdate,
  type AgentTool,
  type AgentTurnContext,
} from '@earendil-works/pi-agent-core'
import type { AssistantMessageEventStream } from '@earendil-works/pi-ai'
import type { TelemetrySpan } from '@earendil-works/pi-telemetry'

import { getAiAgentSummarizationOptions } from '#ai/core/ai_agent_config'
import type { AiAgentConfirmationSummary } from '#ai/core/ai_agent_confirmation'
import {
  isAiAgentReadTool,
  isAiAgentTerminalToolResult,
  isRecoverableAiAgentReadToolError,
  maxConsecutiveAiAgentReadToolFailures,
} from '#ai/core/ai_agent_tool_errors'
import type { AiAgentToolWithConfirmation } from '#ai/registry/ai_agent_tool_helpers'
import {
  compactPiContext,
  estimatePiMessages,
  getPiContextMessages,
  trimPiContextToTokenBudget,
  truncateTextToTokenBudget,
} from '#ai/runtime/pi/ai_agent_context_compaction'
import { createPiModels, getPiRuntimeConfiguration } from '#ai/runtime/pi/ai_agent_pi_provider'
import type { PiAgentMessage, PiModelUsage } from '#ai/runtime/pi/ai_agent_pi_types'

/**
 * Pi runtime boundary for the backend AI assistant.
 *
 * The application owns credentials, authorization, persistence, and tool
 * execution. Pi only owns the model/tool loop and its typed event stream.
 */
function isTerminalToolResult(result: unknown) {
  if (!result || typeof result !== 'object') return false
  const details = 'details' in result ? (result as { details?: unknown }).details : result
  const toolName = 'toolName' in result ? String((result as { toolName?: unknown }).toolName) : ''
  return isAiAgentTerminalToolResult(toolName, details)
}

function addToolTelemetry(
  tool: AgentTool,
  getTelemetrySpan: () => TelemetrySpan | undefined
): AgentTool {
  const instrumentedTool: AgentTool = {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const telemetry = getTelemetrySpan()
      if (!telemetry) return tool.execute(toolCallId, params, signal, onUpdate)

      return telemetry.startSpan(
        {
          name: 'api-starter.ai.tool',
          attributes: {
            'app.ai.tool.name': tool.name,
            'app.ai.tool.call_id': toolCallId,
          },
        },
        async (span) => {
          span.setAttributes({ 'langfuse.observation.input': JSON.stringify(params) })
          const result = await tool.execute(toolCallId, params, signal, onUpdate)
          span.setAttributes({ 'langfuse.observation.output': JSON.stringify(result) })
          if (result.isError) span.setStatus({ status: 'error' })
          return result
        }
      )
    },
  }
  return instrumentedTool
}

export function shouldStopPiAfterTurn(
  input: Pick<AgentTurnContext, 'message' | 'toolResults'>,
  hasQueuedMessages = false,
  readToolFailureLimitReached = false
) {
  if (input.message.stopReason === 'error' || input.message.stopReason === 'aborted') return true
  if (hasQueuedMessages) return false
  if (readToolFailureLimitReached) return true
  return (
    input.toolResults.length > 0 &&
    input.toolResults.every((result) => isTerminalToolResult(result))
  )
}

export async function createPiAgent(input: {
  systemPrompt: string
  tools: AgentTool[]
  messages?: PiAgentMessage[]
  sessionId?: string
  signal?: AbortSignal
  initialRuntimeContext?: string
  refreshRuntimeContext?: () => Promise<string | undefined>
  contextSummary?: string | null
  contextSummaryMessageId?: number | null
  onCompaction?: (summary: string, coveredThroughMessageId: number) => Promise<void>
  onCompactionUsage?: (usage: PiModelUsage) => void | Promise<void>
  onConfirmationRequested?: (toolCallId: string, confirmation: AiAgentConfirmationSummary) => void
  getTelemetrySpan?: () => TelemetrySpan | undefined
}) {
  const models = await createPiModels()
  const runtimeConfig = await getPiRuntimeConfiguration()
  const modelName = runtimeConfig.chat.model
  const model = models.getModel('api-starter-openai', modelName)
  if (!model) throw new Error(`Pi model is not configured: ${modelName}`)

  let hasQueuedMessages = () => false
  let consecutiveReadToolFailures = 0
  const summaryOptions = getAiAgentSummarizationOptions()
  let contextSummary = truncateTextToTokenBudget(
    input.contextSummary ?? '',
    summaryOptions.maxOutputTokens
  )
  let contextSummaryMessageId = input.contextSummaryMessageId ?? 0
  const getTelemetrySpan = input.getTelemetrySpan ?? (() => undefined)
  const tools = input.tools.map((tool) => addToolTelemetry(tool, getTelemetrySpan))
  const agent = new Agent({
    initialState: {
      systemPrompt: input.systemPrompt,
      model,
      tools,
      messages: [
        {
          role: 'system',
          content: input.systemPrompt,
          sections: { runtime_context: input.initialRuntimeContext ?? '' },
          timestamp: Date.now(),
        },
        ...(contextSummary
          ? [
              {
                role: 'user' as const,
                content: `<conversation-summary>\n${contextSummary}\n</conversation-summary>`,
                timestamp: Date.now(),
                isContextSummary: true,
              },
            ]
          : []),
        ...(input.messages ?? []),
      ],
      thinkingLevel: runtimeConfig.chat.reasoningLevel,
    },
    streamFn: (requestModel, context, options) => {
      const telemetry = input.getTelemetrySpan?.()
      if (!telemetry) return models.streamSimple(requestModel, context, options)

      return new Promise<AssistantMessageEventStream>((resolve, reject) => {
        void telemetry
          .startSpan(
            {
              name: 'api-starter.ai.model_call',
              attributes: {
                'langfuse.observation.type': 'generation',
                'langfuse.observation.model.name': requestModel.id,
                'langfuse.observation.input': JSON.stringify(context.messages),
              },
            },
            async (span) => {
              const stream = models.streamSimple(requestModel, context, {
                ...options,
                telemetry: span,
              })
              resolve(stream)
              const response = await stream.result()
              span.setAttributes({
                'langfuse.observation.output': JSON.stringify(response.content),
                'usage.input': response.usage.input,
                'usage.output': response.usage.output,
                'usage.cache_read': response.usage.cacheRead,
                'usage.cache_write': response.usage.cacheWrite,
                'cost.total': response.usage.cost.total,
                'app.ai.stop_reason': response.stopReason,
              })
              if (response.stopReason === 'error') {
                span.setStatus({
                  status: 'error',
                  error: {
                    name: 'ProviderError',
                    message: response.errorMessage ?? 'AI provider error',
                  },
                })
              }
            }
          )
          .catch(reject)
      })
    },
    toolExecution: 'parallel',
    steeringMode: 'one-at-a-time',
    followUpMode: 'one-at-a-time',
    sessionId: input.sessionId,
    convertToLlm: getPiContextMessages,
    transformContext: async (messages, signal) => {
      const tokenBudget = Math.max(model.contextWindow - model.maxTokens, 1)
      if (summaryOptions.enabled && estimatePiMessages(messages) > tokenBudget) {
        try {
          const compactedMessages = await compactPiContext({
            messages,
            models,
            model,
            tokenBudget,
            previousSummary: contextSummary,
            coveredThroughMessageId: contextSummaryMessageId,
            summaryInputTokenBudget: summaryOptions.maxInputTokens,
            summaryOutputTokenBudget: Math.min(summaryOptions.maxOutputTokens, model.maxTokens),
            signal,
            onCompaction: input.onCompaction,
            onUsage: input.onCompactionUsage,
            getTelemetrySpan: input.getTelemetrySpan,
          })
          if (compactedMessages) {
            contextSummary = compactedMessages.summary
            contextSummaryMessageId = compactedMessages.coveredThroughMessageId
            return trimPiContextToTokenBudget(compactedMessages.messages, tokenBudget)
          }
        } catch {
          // Context trimming below keeps a failed summary request from aborting the chat turn.
        }
      }
      return trimPiContextToTokenBudget(messages, tokenBudget)
    },
    finishTurn: (context) =>
      shouldStopPiAfterTurn(
        context,
        hasQueuedMessages(),
        consecutiveReadToolFailures >= maxConsecutiveAiAgentReadToolFailures
      )
        ? { action: 'end' }
        : undefined,
    prepareNextTurnWithContext: async (
      _context,
      signal
    ): Promise<AgentLoopTurnUpdate | undefined> => {
      if (signal?.aborted || !input.refreshRuntimeContext) return undefined
      const runtimeContext = await input.refreshRuntimeContext()
      return runtimeContext === undefined
        ? undefined
        : {
            messages: [
              {
                role: 'system',
                content: '',
                sections: { runtime_context: runtimeContext },
                timestamp: Date.now(),
              },
            ],
          }
    },
    beforeToolCall: async ({ toolCall, args }) => {
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        return { block: true, terminate: true, reason: '工具参数必须是对象' }
      }
      const tool = input.tools.find((candidate) => candidate.name === toolCall.name) as
        | AiAgentToolWithConfirmation
        | undefined
      if (tool?.prepareConfirmation) {
        try {
          const confirmation = await tool.prepareConfirmation(args)
          input.onConfirmationRequested?.(toolCall.id, confirmation)
          return { block: true, terminate: true, reason: '等待用户确认后执行' }
        } catch (error) {
          return {
            block: true,
            terminate: true,
            reason: error instanceof Error ? error.message : '无法准备确认提案',
          }
        }
      }
      return undefined
    },
    afterToolCall: async ({ result, isError, toolCall }) => {
      const isReadFailure = isRecoverableAiAgentReadToolError(toolCall.name, result.details)
      if (isReadFailure) consecutiveReadToolFailures += 1
      else if (isAiAgentReadTool(toolCall.name)) consecutiveReadToolFailures = 0

      return {
        isError,
        terminate:
          isError ||
          result.terminate === true ||
          isAiAgentTerminalToolResult(toolCall.name, result.details) ||
          consecutiveReadToolFailures >= maxConsecutiveAiAgentReadToolFailures,
      }
    },
  })
  hasQueuedMessages = () => agent.hasQueuedMessages()

  if (input.signal) {
    if (input.signal.aborted) agent.abort()
    else input.signal.addEventListener('abort', () => agent.abort(), { once: true })
  }

  return { agent, models, model }
}
