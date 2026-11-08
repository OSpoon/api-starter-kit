import type { AiAgentToolFrame } from '#ai/chat/ai_chat_sse_adapter'
import type { attachAgentRunConfirmations } from '#ai/core/ai_agent_confirmation'
import type { AiAgentCredentialDisclosure } from '#ai/core/ai_agent_tool_context'
import type { AiChatCitation, AiChatRuntimeDetail } from '#models/ai_chat_message'
import type {
  serializeAiChatConversation,
  serializeAiChatMessage,
} from '#transformers/ai_chat_transformer'

type ToolFrameEventMap = {
  [Event in AiAgentToolFrame['event']]: Extract<AiAgentToolFrame, { event: Event }>['data']
}

type SerializedConversation = ReturnType<typeof serializeAiChatConversation>
type SerializedMessage = ReturnType<typeof serializeAiChatMessage>
type AttachedConfirmation = Awaited<ReturnType<typeof attachAgentRunConfirmations>>[number] & {
  messageId: number
}

type AiChatAgentPhaseEvent = Omit<Extract<AiChatRuntimeDetail, { kind: 'phase' }>, 'kind'> & {
  serverName?: string
  toolCount?: number
  tools?: Array<{ name: string; mode?: 'read' | 'confirm' }>
}

export type AiChatTurnEventMap = ToolFrameEventMap & {
  user: { conversation: SerializedConversation; message: SerializedMessage }
  agent_phase: AiChatAgentPhaseEvent
  agent_model_text: { callId: string; text: string; streaming: boolean; append: boolean }
  agent_model_text_clear: { callId: string }
  agent_citations: { citations: AiChatCitation[] }
  credential_disclosure: { credential: AiAgentCredentialDisclosure }
  channel_progress: { content: string }
  delta: { content: string }
  assistant_segment_start: Record<string, never>
  channel_preview: { callId: string; text: string }
  channel_candidate_delta: { content: string }
  agent_candidate_delta: { callId: string; content: string }
  channel_candidate_clear: Record<string, never>
  agent_candidate_clear: { callId: string }
  agent_candidate_commit: { callId: string }
  run: { agentRunId: string | null; usage: Record<string, unknown>; durationMs: number }
  done: {
    conversation: SerializedConversation
    message: SerializedMessage
    confirmations: AttachedConfirmation[]
  }
  error: { message: string; assistantMessage?: SerializedMessage }
}

export type AiChatTurnEvent = {
  [Event in keyof AiChatTurnEventMap]: { event: Event; data: AiChatTurnEventMap[Event] }
}[keyof AiChatTurnEventMap]
