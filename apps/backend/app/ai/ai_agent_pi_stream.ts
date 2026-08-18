import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { AssistantMessage, Usage } from '@earendil-works/pi-ai'

import { createPiAgent, type PiAgentMessage } from '#ai/ai_agent_pi_runtime'
import { type AiAgentPageContext, createAiAgentSystemPrompt } from '#ai/ai_agent_prompt_policy'
import type { AiAgentToolRequestContext } from '#ai/ai_agent_tool_context'
import { createAiAgentTools } from '#ai/ai_agent_tool_registry'
import type { AiAgentMessage } from '#ai/ai_agent_types'

export type PiAgentControl = {
  steer(content: string): void
  followUp(content: string): void
  abort(): void
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
  return messages.reduce<PiAgentMessage[]>((result, message) => {
    // The stable system policy is supplied through Agent initialState. A
    // persisted system-role message must never be reclassified as an
    // assistant response when restoring the Pi context.
    if (message.role === 'system') return result
    if (message.role === 'user') {
      result.push({ role: 'user', content: message.content, timestamp: Date.now() })
      return result
    }
    result.push({
      role: 'assistant',
      content: [{ type: 'text', text: message.content }],
      api: 'openai-completions',
      provider: 'api-starter-openai',
      model: 'history',
      usage: emptyUsage,
      stopReason: 'stop',
      timestamp: Date.now(),
    } satisfies AssistantMessage)
    return result
  }, [])
}

export function createAiAgentPiStream(
  input: AiAgentToolRequestContext & {
    messages: AiAgentMessage[]
    context?: AiAgentPageContext
    liveSessionContext?: string
    getLiveSessionContext?: () => Promise<string>
    agentRunId: string
    onCompaction?: (summary: string) => Promise<void>
  }
) {
  const events = new AsyncQueue<AgentEvent>()

  const lastMessage = input.messages.at(-1)
  const initialMessages =
    lastMessage?.role === 'user' ? input.messages.slice(0, -1) : input.messages

  const { agent } = createPiAgent({
    systemPrompt: createAiAgentSystemPrompt(input.context, input.liveSessionContext),
    tools: createAiAgentTools({ ...input, agentRunId: input.agentRunId }),
    messages: toPiMessages(initialMessages),
    sessionId: `ai-chat:${input.conversationId}`,
    signal: input.signal,
    onCompaction: input.onCompaction,
    refreshContext: async () => {
      const liveSessionContext = await input.getLiveSessionContext?.()
      return liveSessionContext === undefined
        ? undefined
        : createAiAgentSystemPrompt(input.context, liveSessionContext)
    },
  })

  const control: PiAgentControl = {
    steer(content) {
      agent.steer({ role: 'user', content, timestamp: Date.now() })
    },
    followUp(content) {
      agent.followUp({ role: 'user', content, timestamp: Date.now() })
    },
    abort() {
      agent.abort()
    },
  }

  agent.subscribe(async (event: AgentEvent) => {
    events.push(event)
    if (event.type === 'agent_end') events.end()
  })

  // `continue()` is for retrying an existing Pi run. A persisted user
  // message is not automatically submitted to the model, so start a fresh
  // prompt with the latest user content after restoring the prior history.
  const run = lastMessage?.role === 'user' ? agent.prompt(lastMessage.content) : Promise.resolve()
  void run.catch(() => {
    events.end()
  })

  return {
    events,
    control,
  }
}
