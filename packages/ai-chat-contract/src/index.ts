export type AiChatRole = 'user' | 'assistant'

export interface AiChatCitation {
  documentId: number
  chunkId: number
  title: string
  excerpt: string
}

export interface AiChatConversationSummary {
  id: number
  title: string
  createdAt: string | null
  updatedAt: string | null
}

export interface AiChatAgentActivityDetail {
  templateCode?: string
  action?: string
  permissionCode?: string
  targetType?: string
  targetId?: string | number | null
  targetLabel?: string
  confirmationId?: number
  toolName?: string
  resultCount?: number
  message?: string
  progress?: number
  completed?: number
  total?: number
  parameterSummary?: Array<{ name: string; type: string }>
  skillCode?: string
  skillName?: string
  skillInstructionCharacters?: number
  skillCount?: number
  skillNames?: string[]
  inputPreview?: string
  outputPreview?: string
  [key: string]: unknown
}

export interface AiChatAgentActivity {
  name: string
  state: 'running' | 'done' | 'error'
  callId?: string
  startedAt?: number
  displayName?: string
  durationMs?: number
  message?: string
  errorCode?: string
  phase?: string
  detail?: AiChatAgentActivityDetail
}

export interface AiChatPlanStep {
  key: string
  label?: string
  state: 'pending' | 'running' | 'done'
  startedAt?: number
  durationMs?: number
}

export interface AiChatRunPhase {
  kind: 'phase'
  name: 'preparing_agent' | 'model_response'
  state: 'running' | 'done' | 'error'
  callId: string
  startedAt: number
  durationMs?: number
  outcome?: 'tool_call' | 'final_response'
}

export interface AiChatRunUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  totalTokens: number
  modelCalls: number
  compactionCalls?: number
  [key: string]: number | undefined
}

export interface AiChatRunMeta {
  agentRunId: string
  usage: AiChatRunUsage
  durationMs: number
}

export type AiChatTimelineItem =
  | { kind: 'model_text'; callId: string; text: string; streaming?: boolean }
  | {
      kind: 'plan'
      turn?: number
      planType?: 'task' | 'confirmation'
      steps: AiChatPlanStep[]
    }
  | AiChatRunPhase
  | ({ kind: 'tool' } & AiChatAgentActivity)
  | {
      kind: 'run'
      state?: 'done' | 'error'
      durationMs: number
      usage: AiChatRunUsage
    }
  | {
      kind: 'confirmation'
      action: string
      targetLabel?: string
      status: 'confirmed' | 'failed' | 'expired' | 'cancelled'
      completedAt: string
    }

export interface AiChatMessage {
  id: number
  conversationId: number
  role: AiChatRole
  content: string
  image?: { mimeType: string }
  pdf?: { name: string }
  citations: AiChatCitation[]
  createdAt: string | null
  updatedAt: string | null
  timeline?: AiChatTimelineItem[]
}

export interface AiChatConfirmation {
  id: number
  messageId: number
  action: string
  status?: 'pending' | 'confirmed' | 'expired' | 'failed' | 'cancelled'
  impact: 'standard' | 'destructive'
  targetType: string
  targetId: string | null
  targetSummary: Record<string, unknown>
  changeSummary: Array<{ field: string; value: string }>
  expiresAt: string | null
  presentation: {
    title: string
    summary: string
    targetLabel: string | null
    changes: Array<{ label: string; value: string }>
    impactLabel: string
    approveLabel: string
    cancelLabel: string
  }
}

export type AiChatPendingConfirmation = Omit<AiChatConfirmation, 'messageId'>

export interface AiChatCredentialDisclosure {
  kind: 'api_key' | 'password'
  value: string
  label: string
}

export type AiChatAgentPhaseEvent = Omit<AiChatRunPhase, 'kind'> & {
  serverName?: string
  toolCount?: number
  tools?: Array<{ name: string; mode?: 'read' | 'confirm' }>
}

export interface AiChatStreamEventMap {
  user: { conversation: AiChatConversationSummary; message: AiChatMessage }
  delta: { content: string }
  agent_candidate_delta: { callId: string; content: string }
  agent_candidate_clear: { callId: string }
  agent_candidate_commit: { callId: string }
  assistant_segment_start: Record<string, never>
  agent_status: AiChatAgentActivity
  agent_phase: AiChatAgentPhaseEvent
  agent_model_text: { callId: string; text: string; streaming: boolean; append: boolean }
  agent_model_text_clear: { callId: string }
  agent_plan: {
    turn?: number
    planType?: 'task' | 'confirmation'
    steps: AiChatPlanStep[]
  }
  agent_citations: { citations: AiChatCitation[] }
  agent_confirmation: AiChatPendingConfirmation
  run: AiChatRunMeta
  credential_disclosure: { credential: AiChatCredentialDisclosure }
  done: {
    conversation: AiChatConversationSummary
    message: AiChatMessage
    confirmations: AiChatConfirmation[]
  }
  error: { message: string; assistantMessage?: AiChatMessage }
}

export type AiChatStreamEvent = {
  [Event in keyof AiChatStreamEventMap]: { type: Event } & AiChatStreamEventMap[Event]
}[keyof AiChatStreamEventMap]
