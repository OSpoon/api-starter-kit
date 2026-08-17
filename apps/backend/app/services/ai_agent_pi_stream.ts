import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { AssistantMessage, Usage } from '@earendil-works/pi-ai'

import { createPiAgent, type PiAgentMessage } from '#services/ai_agent_pi_runtime'
import {
  type AiAgentPageContext,
  createAiAgentSystemPrompt,
} from '#services/ai_agent_prompt_policy'
import type { AiAgentToolRequestContext } from '#services/ai_agent_tool_context'
import { createAiAgentTools } from '#services/ai_agent_tool_registry'
import type { AiAgentMessage } from '#services/ai_agent_types'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

type PiModelOutput = {
  usage_metadata?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
}

function assistantText(message: AssistantMessage) {
  return message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

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

const emptyUsage: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

function toPiMessages(messages: AiAgentMessage[]): PiAgentMessage[] {
  return messages.map((message) => {
    if (message.role === 'user') {
      return { role: 'user', content: message.content, timestamp: Date.now() }
    }
    return {
      role: 'assistant',
      content: [{ type: 'text', text: message.content }],
      api: 'openai-completions',
      provider: 'api-starter-openai',
      model: 'history',
      usage: emptyUsage,
      stopReason: 'stop',
      timestamp: Date.now(),
    } satisfies AssistantMessage
  })
}

export function createAiAgentPiStream(
  input: AiAgentToolRequestContext & {
    messages: AiAgentMessage[]
    context?: AiAgentPageContext
    liveSessionContext?: string
    agentRunId: string
  }
) {
  const messageQueue = new AsyncQueue<{
    text: AsyncIterable<string>
    output: Promise<PiModelOutput>
  }>()
  const toolQueue = new AsyncQueue<{
    name: string
    callId: string
    input: unknown
    status: Promise<'finished' | 'error'>
    output: Promise<unknown>
  }>()
  const activeMessages = new Map<
    string,
    {
      text: AsyncQueue<string>
      output: Deferred<PiModelOutput>
      streamedText: string
    }
  >()
  const activeTools = new Map<
    string,
    {
      status: Deferred<'finished' | 'error'>
      output: Deferred<unknown>
    }
  >()

  const lastMessage = input.messages.at(-1)
  const initialMessages =
    lastMessage?.role === 'user' ? input.messages.slice(0, -1) : input.messages

  const { agent } = createPiAgent({
    systemPrompt: createAiAgentSystemPrompt(input.context, input.liveSessionContext),
    tools: createAiAgentTools({ ...input, agentRunId: input.agentRunId }),
    messages: toPiMessages(initialMessages),
    signal: input.signal,
  })

  agent.subscribe(async (event: AgentEvent) => {
    if (event.type === 'message_start' && event.message.role === 'assistant') {
      const text = new AsyncQueue<string>()
      const output = deferred<PiModelOutput>()
      activeMessages.set('assistant', { text, output, streamedText: '' })
      messageQueue.push({ text, output: output.promise })
    }
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      const active = activeMessages.get('assistant')
      if (!active) return
      active.streamedText += event.assistantMessageEvent.delta
      active.text.push(event.assistantMessageEvent.delta)
    }
    if (event.type === 'message_end' && event.message.role === 'assistant') {
      let active = activeMessages.get('assistant')
      if (!active) {
        const text = new AsyncQueue<string>()
        const output = deferred<PiModelOutput>()
        active = { text, output, streamedText: '' }
        activeMessages.set('assistant', active)
        messageQueue.push({ text, output: output.promise })
      }

      // Some OpenAI-compatible providers emit the complete assistant content
      // only on message_end and produce no text_delta events. Recover that
      // content so the persistence layer never sees an empty assistant turn.
      const finalText = assistantText(event.message)
      if (finalText && !active.streamedText) {
        active.text.push(finalText)
      } else if (finalText.startsWith(active.streamedText)) {
        const remainder = finalText.slice(active.streamedText.length)
        if (remainder) active.text.push(remainder)
      }
      active.text.end()
      if (event.message.stopReason === 'error' || event.message.stopReason === 'aborted') {
        active.output.reject(
          new Error(event.message.errorMessage ?? `AI provider ${event.message.stopReason}`)
        )
      } else {
        active.output.resolve({
          usage_metadata: {
            input_tokens: event.message.usage.input,
            output_tokens: event.message.usage.output,
            total_tokens: event.message.usage.totalTokens,
          },
        })
      }
      activeMessages.delete('assistant')
    }
    if (event.type === 'tool_execution_start') {
      const status = deferred<'finished' | 'error'>()
      const output = deferred<unknown>()
      activeTools.set(event.toolCallId, { status, output })
      toolQueue.push({
        name: event.toolName,
        callId: event.toolCallId,
        input: event.args,
        status: status.promise,
        output: output.promise,
      })
    }
    if (event.type === 'tool_execution_end') {
      const active = activeTools.get(event.toolCallId)
      if (!active) return
      active.output.resolve(event.result?.details ?? event.result)
      active.status.resolve(event.isError ? 'error' : 'finished')
      activeTools.delete(event.toolCallId)
    }
    if (event.type === 'agent_end') {
      messageQueue.end()
      toolQueue.end()
    }
  })

  // `continue()` is for retrying an existing Pi run. A persisted user
  // message is not automatically submitted to the model, so start a fresh
  // prompt with the latest user content after restoring the prior history.
  const run = lastMessage?.role === 'user' ? agent.prompt(lastMessage.content) : Promise.resolve()
  void run.catch((error) => {
    for (const active of activeMessages.values()) {
      active.text.end()
      active.output.reject(error)
    }
    messageQueue.end()
    toolQueue.end()
  })

  return {
    messages: messageQueue,
    toolCalls: toolQueue,
  }
}
