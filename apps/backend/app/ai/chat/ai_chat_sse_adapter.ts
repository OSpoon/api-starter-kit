import type { HttpContext } from '@adonisjs/core/http'

import type { AgentAssistantMessage } from '#ai/agent'
import type { createAiAgentStream } from '#ai/chat/ai_agent_service'
import type { AiAgentConfirmationSummary } from '#ai/core/ai_agent_confirmation'
import { sanitizeAiAgentToolErrorMessage } from '#ai/core/ai_agent_tool_errors'
import { summarizeAiAgentToolParameters } from '#ai/core/ai_agent_tool_summary'

type AiAgentPlanStep = {
  key: string
  label?: string
  state: 'pending' | 'running' | 'done'
  startedAt?: number
  durationMs?: number
}

export type AiAgentToolFrame =
  | {
      event: 'agent_plan'
      data: { planType?: 'task' | 'confirmation'; steps: AiAgentPlanStep[] }
    }
  | {
      event: 'agent_status'
      data: {
        name: string
        callId: string
        state: 'running' | 'done' | 'error'
        startedAt?: number
        durationMs?: number
        displayName?: string
        detail?: Record<string, unknown>
        phase?: string
        message?: string
        errorCode?: string
      }
    }
  | { event: 'tool_completed'; data: { name: string; output: unknown } }
  | { event: 'agent_confirmation'; data: AiAgentConfirmationSummary }

export type AiAgentTurnEvent =
  | { source: 'queued_user_message' }
  | { source: 'message_start' }
  | { source: 'message_candidate_delta'; value: string }
  | { source: 'message_candidate_clear' }
  | { source: 'model_text_delta'; value: string }
  | { source: 'message_delta'; value: string }
  | {
      source: 'message_end'
      value: {
        providerId: string
        modelId: string
        baseUrl: string
        hasToolCall: boolean
        text: string
        inputTokens: number
        outputTokens: number
        cacheReadTokens: number
        cacheWriteTokens: number
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

const MANAGED_ACTION_TOOL_ACTIONS: Record<string, string> = {
  create_api_key: 'create_api_key',
  revoke_api_key: 'revoke_api_key',
  delete_api_key: 'delete_api_key',
}

function isManagedActionTool(name: string) {
  return (
    name === 'system_management_change' ||
    name === 'create_api_key' ||
    name === 'revoke_api_key' ||
    name === 'delete_api_key'
  )
}

function isActionPreparationTool(name: string) {
  return isManagedActionTool(name)
}

function getManagedAction(name: string, input: unknown) {
  if (name === 'system_management_change') {
    if (input && typeof input === 'object') {
      const action = (input as Record<string, unknown>).action
      if (typeof action === 'string') return action
    }
    return null
  }
  return MANAGED_ACTION_TOOL_ACTIONS[name] ?? null
}

function getAgentStatusDetail(
  name: string,
  input: unknown,
  output?: unknown,
  confirmation?: AiAgentConfirmationSummary
) {
  if (!input || typeof input !== 'object') return undefined
  const values = input as Record<string, unknown>
  const outputRecord =
    output && typeof output === 'object' ? (output as Record<string, unknown>) : null
  if (name === 'run_registered_query' && typeof values.templateCode === 'string' && !confirmation) {
    return {
      templateCode: values.templateCode,
      parameterSummary: summarizeAiAgentToolParameters(values),
      ...(outputRecord?.kind === 'query_result' && Array.isArray(outputRecord.rows)
        ? { resultCount: outputRecord.rows.length }
        : {}),
    }
  }
  const action = getManagedAction(name, input)
  if (isManagedActionTool(name) && action) {
    const targetSummary =
      confirmation?.targetSummary && typeof confirmation.targetSummary === 'object'
        ? confirmation.targetSummary
        : null
    const targetLabel =
      (typeof targetSummary?.name === 'string' && targetSummary.name) ||
      (typeof targetSummary?.fullName === 'string' && targetSummary.fullName) ||
      (typeof targetSummary?.email === 'string' && targetSummary.email) ||
      (typeof targetSummary?.code === 'string' && targetSummary.code)
    return {
      action,
      parameterSummary: summarizeAiAgentToolParameters(values),
      ...(confirmation ? { confirmationId: confirmation.id } : {}),
      ...(confirmation?.targetType ? { targetType: confirmation.targetType } : {}),
      ...(confirmation?.targetId ? { targetId: confirmation.targetId } : {}),
      ...(targetLabel ? { targetLabel } : {}),
      ...(typeof targetSummary?.toolName === 'string' ? { toolName: targetSummary.toolName } : {}),
    }
  }
  if (confirmation) {
    const targetSummary = confirmation.targetSummary
    const targetLabel =
      (typeof targetSummary.name === 'string' && targetSummary.name) ||
      (typeof targetSummary.toolName === 'string' && targetSummary.toolName)
    return {
      action: confirmation.action,
      parameterSummary: summarizeAiAgentToolParameters(values),
      targetType: confirmation.targetType,
      targetId: confirmation.targetId,
      confirmationId: confirmation.id,
      ...(name === 'run_registered_query' && typeof values.templateCode === 'string'
        ? { templateCode: values.templateCode }
        : {}),
      ...(targetLabel ? { targetLabel } : {}),
      ...(typeof targetSummary.toolName === 'string' ? { toolName: targetSummary.toolName } : {}),
    }
  }
  if (typeof outputRecord?.toolName === 'string') {
    return {
      toolName: outputRecord.toolName.slice(0, 128),
      parameterSummary: summarizeAiAgentToolParameters(values),
      ...(isJsonRecord(outputRecord.resultSummary)
        ? { resultSummary: outputRecord.resultSummary }
        : {}),
    }
  }
  if (name === 'diagnose_my_access' && typeof values.permissionCode === 'string') {
    return {
      permissionCode: values.permissionCode,
      parameterSummary: summarizeAiAgentToolParameters(values),
    }
  }
  const parameterSummary = summarizeAiAgentToolParameters(values)
  return parameterSummary.length ? { parameterSummary } : undefined
}

function getSkillToolInputPreview(name: string, input: unknown) {
  if (!input || typeof input !== 'object') return undefined
  const values = input as Record<string, unknown>
  if (name === 'load_agent_skill' && typeof values.code === 'string') {
    return `技能：${values.code}\n资源：${typeof values.resourcePath === 'string' ? values.resourcePath : 'SKILL.md'}`
  }
  if (name === 'bash' && typeof values.code === 'string') {
    return `技能：${values.code}\n脚本：${typeof values.scriptPath === 'string' ? values.scriptPath : '未知'}\n参数数：${Array.isArray(values.args) ? values.args.length : 0}`
  }
  return undefined
}

function getSkillToolOutputPreview(output: unknown) {
  if (!isJsonRecord(output)) return undefined
  if (output.kind === 'agent_skill') {
    const code = typeof output.code === 'string' ? output.code : '技能'
    const path = typeof output.resourcePath === 'string' ? output.resourcePath : 'SKILL.md'
    const characters = typeof output.content === 'string' ? output.content.length : 0
    return `已载入 ${code}/${path}（${characters} 字）`
  }
  if (output.kind !== 'skill_script_result' && output.kind !== 'skill_script_error') {
    return undefined
  }
  const text = [output.stdout, output.stderr]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
    .trim()
  if (!text) return `脚本退出码：${String(output.exitCode ?? '未知')}`
  let preview = text
  try {
    const parsed: unknown = JSON.parse(text)
    if (isJsonRecord(parsed)) {
      preview = JSON.stringify(
        Object.fromEntries(
          Object.entries(parsed)
            .filter(
              ([key]) =>
                !/(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization)/i.test(
                  key
                ) && !(output.code === 'system-info' && key === 'path')
            )
            .slice(0, 20)
        ),
        null,
        2
      )
    }
  } catch {
    preview = preview.replace(
      /(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization)["']?\s*[:=]\s*)(["']?)[^,"'\s}]+/gi,
      '$1[已隐藏]'
    )
  }
  return preview.length > 1600 ? `${preview.slice(0, 1600)}\n[内容已截断]` : preview
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getAgentStatusPhase(
  name: string,
  state: 'running' | 'done' | 'error',
  awaitingConfirmation = false
) {
  if (awaitingConfirmation) return 'awaiting_confirmation'
  if (isActionPreparationTool(name)) {
    if (state === 'running') return 'preparing_action'
    return undefined
  }
  if (name === 'search_knowledge_catalog') {
    return state === 'running' ? 'retrieving_knowledge_catalog' : 'knowledge_catalog_retrieved'
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

function readAgentToolArtifact(output: unknown) {
  if (
    output &&
    typeof output === 'object' &&
    'kind' in output &&
    (output.kind === 'action_error' || output.kind === 'query_error')
  ) {
    return output as { kind: 'action_error' | 'query_error'; code?: string; message?: string }
  }
  return null
}

function getToolErrorMessage(result: unknown, output: unknown) {
  const artifact = readAgentToolArtifact(output)
  const resultContent =
    result && typeof result === 'object' && 'content' in result && Array.isArray(result.content)
      ? result.content
          .filter(
            (item): item is { type: 'text'; text: string } =>
              item !== null &&
              typeof item === 'object' &&
              'type' in item &&
              item.type === 'text' &&
              'text' in item &&
              typeof item.text === 'string'
          )
          .map((item) => item.text)
          .join('\n')
      : undefined
  return sanitizeAiAgentToolErrorMessage(artifact?.message || resultContent)
}

function assistantText(message: AgentAssistantMessage) {
  return message.text
}

function assistantMessageHasToolCall(message: AgentAssistantMessage) {
  return message.hasToolCall
}

function getAssistantTextDeltas(finalText: string, streamedText: string, deltas: string[]) {
  if (deltas.length === 0) return finalText ? [finalText] : []
  if (!finalText.startsWith(streamedText)) return [finalText || streamedText]
  const suffix = finalText.slice(streamedText.length)
  return suffix ? [...deltas, suffix] : deltas
}

export async function* streamAiAgentTurnEvents(
  run: Awaited<ReturnType<typeof createAiAgentStream>>,
  signal: AbortSignal,
  options: {
    streamText?: boolean
    captureModelText?: boolean
    streamTextAfterToolExecution?: boolean
  } = {}
): AsyncGenerator<AiAgentTurnEvent> {
  const plan: AiAgentPlanStep[] = [
    { key: 'identify_target', state: 'running', startedAt: Date.now() },
    { key: 'prepare_action', state: 'pending' },
    { key: 'await_confirmation', state: 'pending' },
  ]
  const finishPlanStep = (index: number, finishedAt = Date.now()) => {
    const step = plan[index]
    if (!step) return
    if (step.startedAt !== undefined) {
      step.durationMs = Math.max(0, finishedAt - step.startedAt)
    }
    step.state = 'done'
  }
  const startPlanStep = (index: number, startedAt = Date.now()) => {
    const step = plan[index]
    if (!step) return
    step.state = 'running'
    step.startedAt = startedAt
    delete step.durationMs
  }
  const planFrame = (): AiAgentToolFrame => ({
    event: 'agent_plan',
    data: { planType: 'confirmation', steps: plan.map((step) => ({ ...step })) },
  })
  const toolStartedAt = new Map<string, number>()
  const toolInputs = new Map<string, unknown>()
  const pendingConfirmations = new Map<string, AiAgentConfirmationSummary>()
  let assistantTextBuffer = ''
  let assistantTextDeltas: string[] = []
  let toolCallStarted = false
  let emittedModelTextDeltas = 0
  let toolExecuted = false
  let candidateTextStreamed = false
  let userMessagesSeen = 0
  for await (const event of run.session.events) {
    if (signal.aborted) throw new DOMException('AI request was cancelled', 'AbortError')
    if (event.type === 'confirmation_requested') {
      const confirmation = event.confirmation as AiAgentConfirmationSummary
      pendingConfirmations.set(event.toolCallId, confirmation)
      const requestedAt = Date.now()
      finishPlanStep(0, requestedAt)
      finishPlanStep(1, requestedAt)
      startPlanStep(2, requestedAt)
      yield { source: 'frame', value: planFrame() }
      yield {
        source: 'frame',
        value: { event: 'agent_confirmation', data: confirmation },
      }
      continue
    }
    if (event.type === 'task_plan_updated') {
      yield {
        source: 'frame',
        value: {
          event: 'agent_plan',
          data: { planType: 'task', steps: event.steps as AiAgentPlanStep[] },
        },
      }
      continue
    }
    if (event.type === 'message_start' && event.role === 'user') {
      userMessagesSeen += 1
      if (userMessagesSeen > 1) {
        toolExecuted = false
        yield { source: 'queued_user_message' }
      }
      continue
    }
    if (event.type === 'message_start' && event.role === 'assistant') {
      assistantTextBuffer = ''
      assistantTextDeltas = []
      toolCallStarted = false
      emittedModelTextDeltas = 0
      candidateTextStreamed = false
      yield { source: 'message_start' }
      continue
    }
    if (event.type === 'tool_call_start' && options.captureModelText && !toolCallStarted) {
      if (candidateTextStreamed) {
        yield { source: 'message_candidate_clear' }
        candidateTextStreamed = false
      }
      toolCallStarted = true
      while (emittedModelTextDeltas < assistantTextDeltas.length) {
        const delta = assistantTextDeltas[emittedModelTextDeltas++]
        if (delta) yield { source: 'model_text_delta', value: delta }
      }
      continue
    }
    if (event.type === 'text_delta') {
      assistantTextBuffer += event.delta
      assistantTextDeltas.push(event.delta)
      if (options.streamText) {
        yield { source: 'message_delta', value: event.delta }
      } else if (options.streamTextAfterToolExecution && toolExecuted && !toolCallStarted) {
        candidateTextStreamed = true
        yield { source: 'message_candidate_delta', value: event.delta }
      } else if (options.captureModelText && toolCallStarted) {
        emittedModelTextDeltas = assistantTextDeltas.length
        yield { source: 'model_text_delta', value: event.delta }
      }
      continue
    }
    if (event.type === 'message_end') {
      const hasToolCall = assistantMessageHasToolCall(event.message)
      const finalText = assistantText(event.message)
      if (hasToolCall && candidateTextStreamed) {
        yield { source: 'message_candidate_clear' }
        candidateTextStreamed = false
      }
      if (!hasToolCall && !options.streamText) {
        let deltas: string[]
        if (candidateTextStreamed && !finalText.startsWith(assistantTextBuffer)) {
          yield { source: 'message_candidate_clear' }
          candidateTextStreamed = false
          deltas = [finalText || assistantTextBuffer]
        } else if (candidateTextStreamed) {
          const suffix = finalText.slice(assistantTextBuffer.length)
          deltas = suffix ? [suffix] : []
        } else {
          deltas = getAssistantTextDeltas(finalText, assistantTextBuffer, assistantTextDeltas)
        }
        for (const delta of deltas) {
          yield {
            source: candidateTextStreamed ? 'message_candidate_delta' : 'message_delta',
            value: delta,
          }
        }
      } else if (!hasToolCall && options.streamText) {
        const finalTextSuffix = finalText.startsWith(assistantTextBuffer)
          ? finalText.slice(assistantTextBuffer.length)
          : assistantTextBuffer
            ? ''
            : finalText
        if (finalTextSuffix) yield { source: 'message_delta', value: finalTextSuffix }
      } else if (options.captureModelText) {
        while (emittedModelTextDeltas < assistantTextDeltas.length) {
          const delta = assistantTextDeltas[emittedModelTextDeltas++]
          if (delta) yield { source: 'model_text_delta', value: delta }
        }
        const finalTextSuffix = finalText.startsWith(assistantTextBuffer)
          ? finalText.slice(assistantTextBuffer.length)
          : ''
        if (finalTextSuffix) yield { source: 'model_text_delta', value: finalTextSuffix }
      }
      yield {
        source: 'message_end',
        value: {
          providerId: event.message.providerId,
          modelId: event.message.modelId,
          baseUrl: run.model.baseUrl,
          hasToolCall,
          text: assistantText(event.message),
          inputTokens: event.message.usage.input,
          outputTokens: event.message.usage.output,
          cacheReadTokens: event.message.usage.cacheRead,
          cacheWriteTokens: event.message.usage.cacheWrite,
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
    if (event.type === 'tool_start') {
      if (event.toolName === 'update_task_plan') continue
      const startedAt = Date.now()
      toolStartedAt.set(event.toolCallId, startedAt)
      toolInputs.set(event.toolCallId, event.args)
      if (isActionPreparationTool(event.toolName)) {
        finishPlanStep(0, startedAt)
        startPlanStep(1, startedAt)
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
            startedAt,
            ...(runningDetail ? { detail: runningDetail } : {}),
            ...(runningPhase ? { phase: runningPhase } : {}),
          },
        },
      }
      continue
    }
    if (event.type === 'tool_update') {
      if (event.toolName === 'update_task_plan') continue
      const progressDetail = getToolProgressDetail(event.partialResult)
      const runningDetail = getAgentStatusDetail(event.toolName, event.args)
      yield {
        source: 'frame',
        value: {
          event: 'agent_status',
          data: {
            name: event.toolName,
            callId: event.toolCallId,
            state: 'running',
            startedAt: toolStartedAt.get(event.toolCallId),
            ...(runningDetail || progressDetail
              ? { detail: { ...runningDetail, ...progressDetail } }
              : {}),
            phase: getAgentStatusPhase(event.toolName, 'running') ?? 'executing',
          },
        },
      }
      continue
    }
    if (event.type === 'tool_end') {
      if (event.toolName === 'update_task_plan') continue
      toolExecuted = true
      const output = event.result?.details ?? event.result
      const confirmation = pendingConfirmations.get(event.toolCallId)
      const toolArtifact = readAgentToolArtifact(output)
      const toolErrorCode = toolArtifact?.kind === 'action_error' ? toolArtifact.code : undefined
      const visibleToolError = getToolErrorMessage(event.result, output)
      const completedDetail = getAgentStatusDetail(
        event.toolName,
        toolInputs.get(event.toolCallId),
        output,
        confirmation
      )
      const skillInputPreview = getSkillToolInputPreview(
        event.toolName,
        toolInputs.get(event.toolCallId)
      )
      const skillOutputPreview = getSkillToolOutputPreview(output)
      const visibleCompletedDetail =
        skillInputPreview || skillOutputPreview
          ? {
              ...completedDetail,
              ...(skillInputPreview ? { inputPreview: skillInputPreview } : {}),
              ...(skillOutputPreview ? { outputPreview: skillOutputPreview } : {}),
            }
          : completedDetail
      const completedState =
        confirmation || toolErrorCode === 'permission_denied' || (!event.isError && !toolArtifact)
          ? 'done'
          : 'error'
      yield {
        source: 'frame',
        value: {
          event: 'agent_status',
          data: {
            name: event.toolName,
            callId: event.toolCallId,
            state: completedState,
            startedAt: toolStartedAt.get(event.toolCallId),
            durationMs: Date.now() - (toolStartedAt.get(event.toolCallId) ?? Date.now()),
            ...(visibleCompletedDetail ? { detail: visibleCompletedDetail } : {}),
            ...(getAgentStatusPhase(event.toolName, completedState, Boolean(confirmation))
              ? {
                  phase: getAgentStatusPhase(event.toolName, completedState, Boolean(confirmation)),
                }
              : {}),
            ...(visibleToolError ? { message: visibleToolError } : {}),
            ...(toolErrorCode ? { errorCode: toolErrorCode } : {}),
          },
        },
      }
      if (confirmation) {
        if (plan[2].state !== 'running') startPlanStep(2)
        yield { source: 'frame', value: planFrame() }
      } else if (!event.isError) {
        if (isActionPreparationTool(event.toolName)) {
          finishPlanStep(1)
          yield { source: 'frame', value: planFrame() }
        }
        yield {
          source: 'frame',
          value: { event: 'tool_completed', data: { name: event.toolName, output } },
        }
      }
      toolStartedAt.delete(event.toolCallId)
      toolInputs.delete(event.toolCallId)
      pendingConfirmations.delete(event.toolCallId)
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
