import type { HttpContext } from '@adonisjs/core/http'
import type { AssistantMessage } from '@earendil-works/pi-ai'

import type { createAiAgentStream } from '#ai/chat/ai_agent_service'
import type {
  AiAgentActionToolArtifact,
  AiAgentConfirmationSummary,
} from '#ai/core/ai_agent_confirmation'

type AiAgentPlanStep = {
  key: 'identify_target' | 'prepare_proposal' | 'await_confirmation'
  state: 'pending' | 'running' | 'done'
}

export type AiAgentToolFrame =
  | { event: 'agent_plan'; data: { steps: AiAgentPlanStep[] } }
  | {
      event: 'agent_status'
      data: {
        name: string
        callId: string
        state: 'running' | 'done' | 'error'
        durationMs?: number
        detail?: Record<string, unknown>
        phase?: string
        message?: string
        errorCode?: string
      }
    }
  | { event: 'tool_completed'; data: { name: string; output: unknown } }
  | { event: 'agent_confirmation'; data: AiAgentConfirmationSummary }

export type AiAgentTurnEvent =
  | { source: 'message_start' }
  | { source: 'message_delta'; value: string }
  | {
      source: 'message_end'
      value: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
        error?: Error
      }
    }
  | { source: 'frame'; value: AiAgentToolFrame }

export function writeAiChatSse(response: HttpContext['response'], event: string, data: unknown) {
  if (response.response.writableEnded || response.response.destroyed) return
  response.response.write(`event: ${event}\n`)
  response.response.write(`data: ${JSON.stringify(data)}\n\n`)
}

const KEEPALIVE_INTERVAL_MS = 15_000

export function startAiChatSseKeepalive(response: HttpContext['response']) {
  const handle = setInterval(() => {
    if (response.response.writableEnded || response.response.destroyed) {
      clearInterval(handle)
      return
    }
    response.response.write(': keepalive\n\n')
  }, KEEPALIVE_INTERVAL_MS)
  return () => clearInterval(handle)
}

const PROPOSAL_TOOL_ACTIONS: Record<string, string> = {
  propose_api_key_creation: 'create_api_key',
  propose_api_key_revocation: 'revoke_api_key',
  propose_api_key_deletion: 'delete_api_key',
}

function isProposalTool(name: string) {
  return (
    name === 'propose_system_management_change' ||
    name === 'propose_api_key_creation' ||
    name === 'propose_api_key_revocation' ||
    name === 'propose_api_key_deletion'
  )
}

function getProposalAction(name: string, input: unknown) {
  if (name === 'propose_system_management_change') {
    if (input && typeof input === 'object') {
      const action = (input as Record<string, unknown>).action
      if (typeof action === 'string') return action
    }
    return null
  }
  return PROPOSAL_TOOL_ACTIONS[name] ?? null
}

function getAgentStatusDetail(name: string, input: unknown, output?: unknown) {
  if (!input || typeof input !== 'object') return undefined
  const values = input as Record<string, unknown>
  const outputRecord =
    output && typeof output === 'object' ? (output as Record<string, unknown>) : null
  if (name === 'run_registered_query' && typeof values.templateCode === 'string') {
    return {
      templateCode: values.templateCode,
      ...(outputRecord?.kind === 'query_result' && Array.isArray(outputRecord.rows)
        ? { resultCount: outputRecord.rows.length }
        : {}),
    }
  }
  const action = getProposalAction(name, input)
  if (isProposalTool(name) && action) {
    const confirmation =
      outputRecord?.kind === 'confirmation' && typeof outputRecord.confirmation === 'object'
        ? (outputRecord.confirmation as Record<string, unknown>)
        : null
    const targetSummary =
      confirmation?.targetSummary && typeof confirmation.targetSummary === 'object'
        ? (confirmation.targetSummary as Record<string, unknown>)
        : null
    const targetLabel =
      (typeof targetSummary?.name === 'string' && targetSummary.name) ||
      (typeof targetSummary?.fullName === 'string' && targetSummary.fullName) ||
      (typeof targetSummary?.email === 'string' && targetSummary.email) ||
      (typeof targetSummary?.code === 'string' && targetSummary.code)
    return {
      action,
      ...(confirmation?.targetType ? { targetType: confirmation.targetType } : {}),
      ...(confirmation?.targetId ? { targetId: confirmation.targetId } : {}),
      ...(targetLabel ? { targetLabel } : {}),
    }
  }
  if (name === 'diagnose_my_access' && typeof values.permissionCode === 'string') {
    return { permissionCode: values.permissionCode }
  }
  return undefined
}

function getAgentStatusPhase(name: string, state: 'running' | 'done' | 'error') {
  if (isProposalTool(name)) {
    return state === 'running' ? 'preparing_proposal' : 'awaiting_confirmation'
  }
  if (name === 'search_knowledge') {
    return state === 'running' ? 'retrieving_knowledge' : 'knowledge_retrieved'
  }
  if (name === 'diagnose_my_access') {
    return state === 'running' ? 'checking_access' : 'access_checked'
  }
  return undefined
}

function getToolProgressDetail(partialResult: unknown) {
  if (!partialResult || typeof partialResult !== 'object') return undefined
  const value = partialResult as Record<string, unknown>
  const detail: Record<string, unknown> = {}
  if (typeof value.message === 'string') detail.message = value.message.slice(0, 240)
  if (typeof value.progress === 'number' && Number.isFinite(value.progress)) {
    detail.progress = Math.max(0, Math.min(100, value.progress))
  }
  if (typeof value.completed === 'number' && Number.isFinite(value.completed)) {
    detail.completed = Math.max(0, value.completed)
  }
  if (typeof value.total === 'number' && Number.isFinite(value.total)) {
    detail.total = Math.max(0, value.total)
  }
  return Object.keys(detail).length > 0 ? detail : undefined
}

function readAgentToolArtifact(output: unknown): AiAgentActionToolArtifact | null {
  if (
    output &&
    typeof output === 'object' &&
    'kind' in output &&
    (output.kind === 'confirmation' || output.kind === 'action_error')
  ) {
    return output as AiAgentActionToolArtifact
  }
  return null
}

function assistantText(message: AssistantMessage) {
  return message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

export async function* streamAiAgentTurnEvents(
  run: Awaited<ReturnType<typeof createAiAgentStream>>,
  signal: AbortSignal
): AsyncGenerator<AiAgentTurnEvent> {
  const plan: AiAgentPlanStep[] = [
    { key: 'identify_target', state: 'pending' },
    { key: 'prepare_proposal', state: 'pending' },
    { key: 'await_confirmation', state: 'pending' },
  ]
  const planFrame = (): AiAgentToolFrame => ({
    event: 'agent_plan',
    data: { steps: plan.map((step) => ({ ...step })) },
  })
  const toolStartedAt = new Map<string, number>()
  const toolInputs = new Map<string, unknown>()
  let streamedAssistantText = ''
  for await (const event of run.stream.events) {
    if (signal.aborted) throw new DOMException('AI request was cancelled', 'AbortError')
    if (event.type === 'message_start' && event.message.role === 'assistant') {
      streamedAssistantText = ''
      yield { source: 'message_start' }
      continue
    }
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      streamedAssistantText += event.assistantMessageEvent.delta
      yield { source: 'message_delta', value: event.assistantMessageEvent.delta }
      continue
    }
    if (event.type === 'message_end' && event.message.role === 'assistant') {
      const finalText = assistantText(event.message)
      if (finalText.startsWith(streamedAssistantText)) {
        const remainder = finalText.slice(streamedAssistantText.length)
        if (remainder) yield { source: 'message_delta', value: remainder }
      } else if (finalText && !streamedAssistantText) {
        yield { source: 'message_delta', value: finalText }
      }
      yield {
        source: 'message_end',
        value: {
          inputTokens: event.message.usage.input,
          outputTokens: event.message.usage.output,
          totalTokens: event.message.usage.totalTokens,
          ...(event.message.stopReason === 'error' || event.message.stopReason === 'aborted'
            ? {
                error: new Error(
                  event.message.errorMessage ?? `AI provider ${event.message.stopReason}`
                ),
              }
            : {}),
        },
      }
      continue
    }
    if (event.type === 'tool_execution_start') {
      toolStartedAt.set(event.toolCallId, Date.now())
      toolInputs.set(event.toolCallId, event.args)
      if (isProposalTool(event.toolName)) {
        plan[0].state = 'done'
        plan[1].state = 'running'
        yield { source: 'frame', value: planFrame() }
      }
      const runningDetail = getAgentStatusDetail(event.toolName, event.args)
      const runningPhase = getAgentStatusPhase(event.toolName, 'running')
      yield {
        source: 'frame',
        value: {
          event: 'agent_status',
          data: {
            name: event.toolName,
            callId: event.toolCallId,
            state: 'running',
            ...(runningDetail ? { detail: runningDetail } : {}),
            ...(runningPhase ? { phase: runningPhase } : {}),
          },
        },
      }
      continue
    }
    if (event.type === 'tool_execution_update') {
      const progressDetail = getToolProgressDetail(event.partialResult)
      yield {
        source: 'frame',
        value: {
          event: 'agent_status',
          data: {
            name: event.toolName,
            callId: event.toolCallId,
            state: 'running',
            ...(progressDetail ? { detail: progressDetail } : {}),
            phase: getAgentStatusPhase(event.toolName, 'running') ?? 'executing',
          },
        },
      }
      continue
    }
    if (event.type === 'tool_execution_end') {
      const output = event.result?.details ?? event.result
      const toolArtifact = readAgentToolArtifact(output)
      const toolError = toolArtifact?.kind === 'action_error' ? toolArtifact.message : null
      const toolErrorCode = toolArtifact?.kind === 'action_error' ? toolArtifact.code : undefined
      const visibleToolError = toolArtifact?.kind === 'action_error' ? null : toolError
      const completedDetail = getAgentStatusDetail(
        event.toolName,
        toolInputs.get(event.toolCallId),
        output
      )
      const completedState = !event.isError && !visibleToolError ? 'done' : 'error'
      yield {
        source: 'frame',
        value: {
          event: 'agent_status',
          data: {
            name: event.toolName,
            callId: event.toolCallId,
            state: completedState,
            durationMs: Date.now() - (toolStartedAt.get(event.toolCallId) ?? Date.now()),
            ...(completedDetail ? { detail: completedDetail } : {}),
            ...(getAgentStatusPhase(event.toolName, completedState)
              ? { phase: getAgentStatusPhase(event.toolName, completedState) }
              : {}),
            ...(visibleToolError ? { message: visibleToolError } : {}),
            ...(toolErrorCode ? { errorCode: toolErrorCode } : {}),
          },
        },
      }
      if (!event.isError) {
        if (isProposalTool(event.toolName)) {
          plan[1].state = 'done'
          plan[2].state = 'running'
          yield { source: 'frame', value: planFrame() }
        }
        yield {
          source: 'frame',
          value: { event: 'tool_completed', data: { name: event.toolName, output } },
        }
        if (toolArtifact?.kind === 'confirmation') {
          yield {
            source: 'frame',
            value: { event: 'agent_confirmation', data: toolArtifact.confirmation },
          }
        }
      }
      toolStartedAt.delete(event.toolCallId)
      toolInputs.delete(event.toolCallId)
    }
  }
}

export async function streamAiAgentToolStatuses(
  run: Awaited<ReturnType<typeof createAiAgentStream>>,
  response: HttpContext['response'],
  signal: AbortSignal,
  onToolCompleted?: (name: string, output: unknown) => void | Promise<void>
) {
  const completedToolNames = new Set<string>()
  for await (const event of streamAiAgentTurnEvents(run, signal)) {
    if (event.source !== 'frame') continue
    const frame = event.value
    if (frame.event === 'tool_completed') {
      completedToolNames.add(frame.data.name)
      await onToolCompleted?.(frame.data.name, frame.data.output)
      continue
    }
    writeAiChatSse(response, frame.event, frame.data)
  }
  return completedToolNames
}
