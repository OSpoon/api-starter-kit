import type { HttpContext } from '@adonisjs/core/http'

import type {
  AiAgentActionToolArtifact,
  AiAgentConfirmationSummary,
} from '#services/ai_agent_confirmation'
import type { createAiAgentStream } from '#services/ai_agent_service'

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
  if (name === 'propose_system_management_change' && typeof values.action === 'string') {
    const artifact =
      outputRecord?.artifact && typeof outputRecord.artifact === 'object'
        ? (outputRecord.artifact as Record<string, unknown>)
        : null
    const confirmation =
      artifact?.kind === 'confirmation' && typeof artifact.confirmation === 'object'
        ? (artifact.confirmation as Record<string, unknown>)
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
      action: values.action,
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
  if (name === 'run_registered_query') {
    return state === 'running' ? 'identifying_target' : 'target_identified'
  }
  if (name === 'propose_system_management_change') {
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

function readAgentToolArtifact(output: unknown): AiAgentActionToolArtifact | null {
  const artifact =
    output && typeof output === 'object' && 'artifact' in output ? output.artifact : null
  if (
    artifact &&
    typeof artifact === 'object' &&
    'kind' in artifact &&
    (artifact.kind === 'confirmation' || artifact.kind === 'action_error')
  ) {
    return artifact as AiAgentActionToolArtifact
  }
  const content =
    typeof output === 'string'
      ? output
      : output &&
          typeof output === 'object' &&
          'content' in output &&
          typeof output.content === 'string'
        ? output.content
        : null
  if (!content) return null
  try {
    const payload = JSON.parse(content) as AiAgentActionToolArtifact
    return payload.kind === 'confirmation' || payload.kind === 'action_error' ? payload : null
  } catch {
    return null
  }
}

export async function* streamAiAgentToolFrames(
  run: Awaited<ReturnType<typeof createAiAgentStream>>,
  signal: AbortSignal
): AsyncGenerator<AiAgentToolFrame> {
  const plan: AiAgentPlanStep[] = [
    { key: 'identify_target', state: 'pending' },
    { key: 'prepare_proposal', state: 'pending' },
    { key: 'await_confirmation', state: 'pending' },
  ]
  const planFrame = (): AiAgentToolFrame => ({
    event: 'agent_plan',
    data: { steps: plan.map((step) => ({ ...step })) },
  })
  for await (const toolCall of run.stream.toolCalls) {
    if (signal.aborted) throw new DOMException('AI request was cancelled', 'AbortError')
    const toolStartedAt = Date.now()
    if (toolCall.name === 'run_registered_query') {
      plan[0].state = 'running'
      yield planFrame()
    }
    if (toolCall.name === 'propose_system_management_change') {
      plan[0].state = 'done'
      plan[1].state = 'running'
      yield planFrame()
    }
    const runningDetail = getAgentStatusDetail(toolCall.name, toolCall.input)
    const runningPhase = getAgentStatusPhase(toolCall.name, 'running')
    yield {
      event: 'agent_status',
      data: {
        name: toolCall.name,
        callId: toolCall.callId,
        state: 'running',
        ...(runningDetail ? { detail: runningDetail } : {}),
        ...(runningPhase ? { phase: runningPhase } : {}),
      },
    }
    const state = await toolCall.status
    const output = state === 'finished' ? await toolCall.output : null
    const toolArtifact = readAgentToolArtifact(output)
    const toolError = toolArtifact?.kind === 'action_error' ? toolArtifact.message : null
    const toolErrorCode = toolArtifact?.kind === 'action_error' ? toolArtifact.code : undefined
    const visibleToolError = toolArtifact?.kind === 'action_error' ? null : toolError
    const completedDetail = getAgentStatusDetail(toolCall.name, toolCall.input, output)
    const completedState = state === 'finished' && !visibleToolError ? 'done' : 'error'
    yield {
      event: 'agent_status',
      data: {
        name: toolCall.name,
        callId: toolCall.callId,
        state: completedState,
        durationMs: Date.now() - toolStartedAt,
        ...(completedDetail ? { detail: completedDetail } : {}),
        ...(getAgentStatusPhase(toolCall.name, completedState)
          ? { phase: getAgentStatusPhase(toolCall.name, completedState) }
          : {}),
        ...(visibleToolError ? { message: visibleToolError } : {}),
        ...(toolErrorCode ? { errorCode: toolErrorCode } : {}),
      },
    }
    if (state === 'finished') {
      if (toolCall.name === 'run_registered_query') plan[0].state = 'done'
      if (toolCall.name === 'propose_system_management_change') {
        plan[1].state = 'done'
        plan[2].state = 'running'
      }
      yield planFrame()
      yield { event: 'tool_completed', data: { name: toolCall.name, output } }
      if (toolArtifact?.kind === 'confirmation') {
        yield { event: 'agent_confirmation', data: toolArtifact.confirmation }
      }
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
  for await (const frame of streamAiAgentToolFrames(run, signal)) {
    if (frame.event === 'tool_completed') {
      completedToolNames.add(frame.data.name)
      await onToolCompleted?.(frame.data.name, frame.data.output)
      continue
    }
    writeAiChatSse(response, frame.event, frame.data)
  }
  return completedToolNames
}
