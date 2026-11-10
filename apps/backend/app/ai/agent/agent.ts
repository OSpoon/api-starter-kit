export type AgentTextPart = { type: 'text'; text: string }
export type AgentToolCallPart = { type: 'toolCall'; id?: string; name: string; arguments?: unknown }
export type AgentContentPart = AgentTextPart | AgentToolCallPart | Record<string, unknown>

export type AgentSessionMessage = {
  role: 'system' | 'user' | 'assistant' | 'toolResult'
  content: string | AgentContentPart[]
  timestamp: number
  sourceMessageId?: number
  isContextSummary?: boolean
  [key: string]: unknown
}

export type AgentChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
  id?: number
  image?: { data: string; mimeType: string }
}

export type AgentToolResult = {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>
  details: unknown
  terminate?: boolean
}

export type AgentToolParameters = {
  type: 'object'
  properties?: Record<string, unknown>
  required?: readonly string[]
  additionalProperties?: boolean | Record<string, unknown>
  [key: string]: unknown
}

export type AgentModelCost = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type AgentTraceAttributeValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly number[]
  | readonly boolean[]

export type AgentTraceSpan = {
  id: string
  traceId: string
  parentId?: string
  name: string
  startedMs: number
  endedMs: number
  attributes: Record<string, AgentTraceAttributeValue | undefined>
  events: readonly {
    name: string
    timeMs: number
    attributes: Record<string, AgentTraceAttributeValue | undefined>
  }[]
  links: readonly {
    traceId: string
    spanId: string
    attributes?: Record<string, AgentTraceAttributeValue | undefined>
  }[]
  status: { status: 'ok' } | { status: 'error'; error?: { name: string; message: string } }
}

export type AgentTrace = {
  traceId: string
  spans: readonly AgentTraceSpan[]
}

export type AgentTool = {
  name: string
  label?: string
  description: string
  parameters: AgentToolParameters
  executionMode?: 'parallel' | 'sequential'
  prepareConfirmation?: (args: unknown) => Promise<unknown>
  execute: (
    toolCallId: string,
    args: unknown,
    signal?: AbortSignal,
    onUpdate?: (partialResult: AgentToolResult) => void
  ) => Promise<AgentToolResult>
}

export type AgentUsage = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
}

export type AgentModelConfig = {
  providerId: string
  modelId: string
  baseUrl: string
  apiKey?: string
  contextWindow: number
  maxTokens: number
  reasoning: boolean
  reasoningLevel: string
  cost: AgentModelCost
}

export type AgentModelInfo = {
  providerId: string
  modelId: string
  baseUrl: string
  contextWindow: number
  maxTokens: number
}

export type AgentModelUsage = {
  providerId: string
  modelId: string
  baseUrl: string
  usage: AgentUsage
  status: 'completed' | 'failed'
}

export type AgentAssistantMessage = {
  providerId: string
  modelId: string
  text: string
  hasToolCall: boolean
  usage: AgentUsage
  stopReason: string
  errorMessage?: string
}

export type AgentEvent =
  | { type: 'agent_end' }
  | { type: 'message_start'; role: 'user' | 'assistant' }
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call_start' }
  | {
      type: 'message_end'
      message: AgentAssistantMessage
    }
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: unknown }
  | {
      type: 'tool_update'
      toolCallId: string
      toolName: string
      args: unknown
      partialResult: unknown
    }
  | {
      type: 'tool_end'
      toolCallId: string
      toolName: string
      result: AgentToolResult
      isError: boolean
    }
  | { type: 'confirmation_requested'; toolCallId: string; confirmation: unknown }
  | { type: 'task_plan_updated'; steps: Array<Record<string, unknown>> }

export type AgentSessionState = {
  engineId: string
  version: 1
  messages: AgentSessionMessage[]
}

export type AgentControl = {
  steer(content: string): void
  followUp(content: string): void
  abort(): void
}

export type AgentSession = {
  events: AsyncIterable<AgentEvent>
  control: AgentControl
  completion: Promise<void>
  model: AgentModelInfo
  traceStore?: {
    findTraces(input: { limit: number }): Promise<{ traces: readonly AgentTrace[] }>
  }
  prompt(
    content: string,
    sourceMessageId?: number,
    image?: { data: string; mimeType: string }
  ): Promise<void>
  hasQueuedMessages(): boolean
  getSessionState(): AgentSessionState
}

export type AgentRunOptions = {
  model: AgentModelConfig
  systemPrompt: string
  tools: AgentTool[] | ((emit: (event: AgentEvent) => void) => Promise<AgentTool[]>)
  messages: AgentChatMessage[]
  sessionState?: unknown
  initialPrompt?: string
  initialPromptMessageId?: number
  initialImage?: { data: string; mimeType: string }
  sessionId: string
  signal?: AbortSignal
  runtimeContext?: {
    initialValue?: string
    refresh?: () => Promise<string | undefined>
  }
  summary?: {
    text?: string | null
    coveredThroughMessageId?: number | null
    enabled: boolean
    maxInputTokens: number
    maxOutputTokens: number
    prompt: string
    save?: (summary: string, coveredThroughMessageId: number) => Promise<void>
    onUsage?: (usage: AgentModelUsage) => void | Promise<void>
  }
  telemetry?: {
    enabled: boolean
  }
  shouldStopAfterTurn?: (input: {
    stopReason: string
    toolResults: Array<{ toolName: string; details?: unknown }>
    hasQueuedMessages: boolean
  }) => boolean
  afterToolCall?: (input: { toolName: string; result: AgentToolResult; isError: boolean }) => {
    terminate: boolean
  }
}

export interface AgentEngine {
  readonly id: string
  createSession(input: AgentRunOptions): Promise<AgentSession>
}
