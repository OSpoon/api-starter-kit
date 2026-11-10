import {
  Agent,
  type AgentTool as PiTool,
  type AgentTurnContext,
} from '@earendil-works/pi-agent-core'
import type { AssistantMessageEventStream } from '@earendil-works/pi-ai'
import {
  InMemoryTelemetryContext,
  NOOP_TELEMETRY_CONTEXT,
  type TelemetrySpan,
} from '@earendil-works/pi-telemetry'

import type {
  AgentAssistantMessage,
  AgentEngine,
  AgentEvent,
  AgentRunOptions,
  AgentSession,
  AgentSessionMessage,
  AgentTool,
  AgentToolResult,
  AgentUsage,
} from '../agent.js'
import { restoreAgentSessionState } from '../session_state.js'
import {
  compactPiContext,
  estimatePiMessages,
  getPiContextMessages,
  trimPiContextToTokenBudget,
  truncateTextToTokenBudget,
} from './context_compaction.js'
import { createPiModels } from './provider.js'
import { toPiToolParameters } from './tool_parameters.js'
import { toAgentTrace } from './trace.js'
import type { PiAgentMessage } from './types.js'

class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = []
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = []
  private closed = false

  push(value: T) {
    if (this.closed) return
    const waiter = this.waiters.shift()
    if (waiter) waiter({ done: false, value })
    else this.values.push(value)
  }

  end() {
    this.closed = true
    while (this.waiters.length > 0) this.waiters.shift()?.({ done: true, value: undefined })
  }

  [Symbol.asyncIterator]() {
    return {
      next: async (): Promise<IteratorResult<T>> => {
        const value = this.values.shift()
        if (value !== undefined) return { done: false, value }
        if (this.closed) return { done: true, value: undefined }
        return new Promise((resolve) => this.waiters.push(resolve))
      },
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readNumber(value: unknown) {
  return typeof value === 'number' ? value : 0
}

function normalizeUsage(value: unknown): AgentUsage {
  const usage = isRecord(value) ? value : {}
  const cost = isRecord(usage.cost) ? usage.cost : {}
  return {
    input: readNumber(usage.input),
    output: readNumber(usage.output),
    cacheRead: readNumber(usage.cacheRead),
    cacheWrite: readNumber(usage.cacheWrite),
    totalTokens: readNumber(usage.totalTokens),
    cost: {
      input: readNumber(cost.input),
      output: readNumber(cost.output),
      cacheRead: readNumber(cost.cacheRead),
      cacheWrite: readNumber(cost.cacheWrite),
      total: readNumber(cost.total),
    },
  }
}

function toPiMessages(messages: AgentRunOptions['messages'], providerId: string): PiAgentMessage[] {
  return messages.flatMap((message): PiAgentMessage[] => {
    if (message.role === 'system') return []
    if (message.role === 'user') {
      return [
        {
          role: 'user',
          content: message.image
            ? [
                { type: 'text', text: message.content },
                { type: 'image', data: message.image.data, mimeType: message.image.mimeType },
              ]
            : message.content,
          timestamp: Date.now(),
          ...(message.id !== undefined ? { sourceMessageId: message.id } : {}),
        },
      ]
    }
    return [
      {
        role: 'assistant',
        content: [{ type: 'text', text: message.content }],
        api: 'openai-completions',
        provider: providerId,
        model: 'history',
        usage: normalizeUsage(undefined),
        stopReason: 'stop',
        timestamp: Date.now(),
        ...(message.id !== undefined ? { sourceMessageId: message.id } : {}),
      },
    ]
  }) as PiAgentMessage[]
}

function redactImagesForTelemetry(messages: unknown) {
  if (!Array.isArray(messages)) return messages
  return messages.map((message) => {
    if (!isRecord(message) || !Array.isArray(message.content)) return message
    return {
      ...message,
      content: message.content.map((part) =>
        isRecord(part) && part.type === 'image' ? { type: 'image', mimeType: part.mimeType } : part
      ),
    }
  })
}

function instrumentTool(
  tool: AgentTool,
  getTelemetrySpan: () => TelemetrySpan | undefined
): PiTool {
  return {
    ...tool,
    label: tool.label ?? tool.name,
    parameters: toPiToolParameters(tool.parameters),
    execute: async (toolCallId, params, signal, onUpdate) => {
      const span = getTelemetrySpan()
      if (!span) return tool.execute(toolCallId, params, signal, onUpdate)
      return span.startSpan(
        {
          name: 'api-starter.ai.tool',
          attributes: {
            'app.ai.tool.name': tool.name,
            'app.ai.tool.call_id': toolCallId,
          },
        },
        async (toolSpan) => {
          toolSpan.setAttributes({ 'langfuse.observation.input': JSON.stringify(params) })
          const result = await tool.execute(toolCallId, params, signal, onUpdate)
          toolSpan.setAttributes({ 'langfuse.observation.output': JSON.stringify(result) })
          if (result.terminate) toolSpan.setStatus({ status: 'error' })
          return result
        }
      )
    },
  }
}

function messageText(content: unknown) {
  if (!Array.isArray(content)) return typeof content === 'string' ? content : ''
  return content
    .filter(
      (part): part is { type: 'text'; text: string } =>
        isRecord(part) && part.type === 'text' && typeof part.text === 'string'
    )
    .map((part) => part.text)
    .join('')
}

function normalizeAssistantMessage(message: Record<string, unknown>): AgentAssistantMessage {
  const content = Array.isArray(message.content) ? message.content : []
  const usage = normalizeUsage(message.usage)
  return {
    providerId: String(message.provider ?? ''),
    modelId: String(message.model ?? ''),
    text: messageText(content),
    hasToolCall: content.some((part) => isRecord(part) && part.type === 'toolCall'),
    usage,
    stopReason: String(message.stopReason ?? 'stop'),
    ...(typeof message.errorMessage === 'string' ? { errorMessage: message.errorMessage } : {}),
  }
}

function toolResult(value: unknown): AgentToolResult {
  if (!isRecord(value)) {
    return { content: [{ type: 'text', text: String(value ?? '') }], details: undefined }
  }
  return {
    content: Array.isArray(value.content) ? (value.content as AgentToolResult['content']) : [],
    details: value.details,
    ...(typeof value.terminate === 'boolean' ? { terminate: value.terminate } : {}),
  }
}

function emitPiEvent(value: unknown, emit: (event: AgentEvent) => void, end: () => void) {
  if (!isRecord(value) || typeof value.type !== 'string') return
  if (value.type === 'agent_end') {
    emit({ type: 'agent_end' })
    end()
    return
  }
  if (value.type === 'message_start' && isRecord(value.message)) {
    const role = value.message.role
    if (role === 'user' || role === 'assistant') emit({ type: 'message_start', role })
    return
  }
  if (value.type === 'message_update' && isRecord(value.assistantMessageEvent)) {
    const update = value.assistantMessageEvent
    if (update.type === 'text_delta' && typeof update.delta === 'string') {
      emit({ type: 'text_delta', delta: update.delta })
    } else if (update.type === 'toolcall_start') {
      emit({ type: 'tool_call_start' })
    }
    return
  }
  if (value.type === 'message_end' && isRecord(value.message)) {
    if (value.message.role === 'assistant') {
      emit({ type: 'message_end', message: normalizeAssistantMessage(value.message) })
    }
    return
  }
  if (value.type === 'tool_execution_start') {
    emit({
      type: 'tool_start',
      toolCallId: String(value.toolCallId ?? ''),
      toolName: String(value.toolName ?? ''),
      args: value.args,
    })
    return
  }
  if (value.type === 'tool_execution_update') {
    emit({
      type: 'tool_update',
      toolCallId: String(value.toolCallId ?? ''),
      toolName: String(value.toolName ?? ''),
      args: value.args,
      partialResult: value.partialResult,
    })
    return
  }
  if (value.type === 'tool_execution_end') {
    emit({
      type: 'tool_end',
      toolCallId: String(value.toolCallId ?? ''),
      toolName: String(value.toolName ?? ''),
      result: toolResult(value.result),
      isError: value.isError === true,
    })
  }
}

export const piAgentEngine: AgentEngine = {
  id: 'pi',
  async createSession(input): Promise<AgentSession> {
    const models = await createPiModels(input.model)
    const model = models.getModel(input.model.providerId, input.model.modelId)
    if (!model) throw new Error(`Configured Pi model was not found: ${input.model.modelId}`)

    const events = new AsyncQueue<AgentEvent>()
    const telemetryStore = input.telemetry?.enabled ? new InMemoryTelemetryContext() : undefined
    const telemetry = telemetryStore ?? NOOP_TELEMETRY_CONTEXT
    let activeSpan: TelemetrySpan | undefined
    const getTelemetrySpan = () => activeSpan
    const emit = (event: AgentEvent) => events.push(event)
    const tools = typeof input.tools === 'function' ? await input.tools(emit) : input.tools
    const sessionState = restoreAgentSessionState(
      input.sessionState,
      input.summary?.coveredThroughMessageId,
      this.id
    )
    const hasPiState =
      Array.isArray(input.sessionState) ||
      (isRecord(input.sessionState) && input.sessionState.engineId === this.id)
    const historicalMessages = new Map<number, AgentRunOptions['messages'][number]>()
    for (const message of input.messages) {
      if (message.id !== undefined) historicalMessages.set(message.id, message)
    }
    const priorMessages = hasPiState
      ? (sessionState.messages
          .filter((message) => message.role !== 'system')
          .map((message) => {
            if (message.role !== 'user' || message.sourceMessageId === undefined) return message
            const historyMessage = historicalMessages.get(message.sourceMessageId)
            if (!historyMessage?.image) return message
            return {
              ...message,
              content: [
                { type: 'text', text: messageText(message.content) || historyMessage.content },
                {
                  type: 'image',
                  data: historyMessage.image.data,
                  mimeType: historyMessage.image.mimeType,
                },
              ],
            }
          }) as PiAgentMessage[])
      : toPiMessages(input.messages, input.model.providerId)
    const summaryOptions = input.summary ?? {
      enabled: false,
      maxInputTokens: 0,
      maxOutputTokens: 0,
      prompt: '',
    }
    let contextSummary = truncateTextToTokenBudget(
      input.summary?.text ?? '',
      summaryOptions.maxOutputTokens
    )
    let contextSummaryMessageId = input.summary?.coveredThroughMessageId ?? 0

    const initialMessages: PiAgentMessage[] = [
      {
        role: 'system',
        content: input.systemPrompt,
        sections: { runtime_context: input.runtimeContext?.initialValue ?? '' },
        timestamp: Date.now(),
      } as PiAgentMessage,
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
      ...priorMessages,
    ]
    let hasQueuedMessages = () => false
    const agent = new Agent({
      initialState: {
        systemPrompt: input.systemPrompt,
        model,
        tools: tools.map((tool) => instrumentTool(tool, getTelemetrySpan)),
        messages: initialMessages as never,
        thinkingLevel: (input.model as AgentRunOptions['model'] & { reasoningLevel?: string })
          .reasoningLevel as never,
      },
      streamFn: (requestModel, context, options) => {
        const spanParent = getTelemetrySpan()
        if (!spanParent) return models.streamSimple(requestModel, context, options)
        return new Promise<AssistantMessageEventStream>((resolve, reject) => {
          void spanParent
            .startSpan(
              {
                name: 'api-starter.ai.model_call',
                attributes: {
                  'langfuse.observation.type': 'generation',
                  'langfuse.observation.model.name': requestModel.id,
                  'langfuse.observation.input': JSON.stringify(
                    redactImagesForTelemetry(context.messages)
                  ),
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
            const compacted = await compactPiContext({
              messages,
              models,
              model,
              tokenBudget,
              previousSummary: contextSummary,
              coveredThroughMessageId: contextSummaryMessageId,
              summaryInputTokenBudget: summaryOptions.maxInputTokens,
              summaryOutputTokenBudget: Math.min(summaryOptions.maxOutputTokens, model.maxTokens),
              summaryPrompt: summaryOptions.prompt,
              signal,
              onCompaction: summaryOptions.save,
              onUsage: summaryOptions.onUsage,
              getTelemetrySpan,
            })
            if (compacted) {
              contextSummary = compacted.summary
              contextSummaryMessageId = compacted.coveredThroughMessageId
              return trimPiContextToTokenBudget(compacted.messages, tokenBudget)
            }
          } catch {
            // A failed summary request falls back to trimming the current context.
          }
        }
        return trimPiContextToTokenBudget(messages, tokenBudget)
      },
      finishTurn: (context: AgentTurnContext) =>
        input.shouldStopAfterTurn?.({
          stopReason: context.message.stopReason,
          toolResults: context.toolResults.map((result) => ({
            toolName: result.toolName,
            details: result.details,
          })),
          hasQueuedMessages: hasQueuedMessages(),
        })
          ? { action: 'end' }
          : undefined,
      prepareRequest: input.runtimeContext?.refresh
        ? createRequestContextSectionPreparer(input.runtimeContext)
        : undefined,
      beforeToolCall: async ({ toolCall, args }) => {
        if (!args || typeof args !== 'object' || Array.isArray(args)) {
          return { block: true, terminate: true, reason: '工具参数必须是对象' }
        }
        const tool = tools.find((candidate) => candidate.name === toolCall.name)
        if (!tool?.prepareConfirmation) return undefined
        try {
          const confirmation = await tool.prepareConfirmation(args)
          emit({ type: 'confirmation_requested', toolCallId: toolCall.id, confirmation })
          return { block: true, terminate: true, reason: '等待用户确认后执行' }
        } catch (error) {
          return {
            block: true,
            terminate: true,
            reason: error instanceof Error ? error.message : '无法准备确认提案',
          }
        }
      },
      afterToolCall: async ({ result, isError, toolCall }) => {
        const outcome = input.afterToolCall?.({
          toolName: toolCall.name,
          result: toolResult(result),
          isError,
        })
        return {
          isError,
          terminate: isError || result.terminate === true || outcome?.terminate === true,
        }
      },
    })
    hasQueuedMessages = () => agent.hasQueuedMessages()
    agent.subscribe((event) => emitPiEvent(event, emit, () => events.end()))

    const session: AgentSession = {
      events,
      control: {
        steer(content) {
          agent.steer({ role: 'user', content, timestamp: Date.now() })
        },
        followUp(content) {
          agent.followUp({ role: 'user', content, timestamp: Date.now() })
        },
        abort() {
          agent.abort()
        },
      },
      model: {
        providerId: model.provider,
        modelId: model.id,
        baseUrl: model.baseUrl,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
      },
      prompt: async (content, sourceMessageId, image) => {
        await agent.prompt({
          role: 'user',
          content: image
            ? [
                { type: 'text', text: content },
                { type: 'image', data: image.data, mimeType: image.mimeType },
              ]
            : content,
          timestamp: Date.now(),
          ...(sourceMessageId !== undefined ? { sourceMessageId } : {}),
        })
      },
      hasQueuedMessages: () => agent.hasQueuedMessages(),
      getSessionState: () => ({
        engineId: this.id,
        version: 1,
        messages: agent.state.messages.filter(
          (message) => message.role !== 'system'
        ) as AgentSessionMessage[],
      }),
      ...(telemetryStore
        ? {
            traceStore: {
              async findTraces(traceQuery: { limit: number }) {
                const result = await telemetryStore.findTraces(traceQuery)
                return { traces: result.traces.map(toAgentTrace) }
              },
            },
          }
        : {}),
      completion: Promise.resolve(),
    }
    const initialPrompt = input.initialPrompt
    if (initialPrompt) {
      session.completion = telemetry.startSpan(
        {
          name: 'api-starter.ai.agent_run',
          attributes: {
            'app.ai.agent_run_id': input.sessionId,
            'langfuse.observation.input': JSON.stringify({ role: 'user', content: initialPrompt }),
          },
        },
        async (span) => {
          activeSpan = span
          try {
            await session.prompt(initialPrompt, input.initialPromptMessageId, input.initialImage)
            const response = agent.state.messages.findLast(
              (message) => message.role === 'assistant'
            )
            if (response) {
              span.setAttributes({
                'langfuse.observation.output': JSON.stringify(response.content),
              })
            }
          } finally {
            activeSpan = undefined
          }
        }
      )
      void session.completion.catch(() => events.end())
    }
    if (input.signal) {
      if (input.signal.aborted) agent.abort()
      else input.signal.addEventListener('abort', () => agent.abort(), { once: true })
    }
    return session
  },
}

export function createRequestContextSectionPreparer(
  input: NonNullable<AgentRunOptions['runtimeContext']>
) {
  let initialValuePending = input.initialValue !== undefined
  return async ({ context }: { context: { messages: PiAgentMessage[] } }, signal?: AbortSignal) => {
    if (signal?.aborted) return undefined
    const value = initialValuePending ? input.initialValue : await input.refresh?.()
    initialValuePending = false
    if (signal?.aborted || value === undefined) return undefined
    const messages = context.messages.slice()
    const systemMessageIndex = messages.findIndex((message) => message.role === 'system')
    const systemMessage = messages[systemMessageIndex]
    if (systemMessage?.role !== 'system') return undefined
    messages[systemMessageIndex] = {
      ...systemMessage,
      sections: {
        ...('sections' in systemMessage && isRecord(systemMessage.sections)
          ? systemMessage.sections
          : {}),
        runtime_context: value,
      },
    }
    return { context: { ...context, messages } }
  }
}
