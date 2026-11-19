import type { AiChatStreamEventMap } from '@api-starter-kit/ai-chat-contract'

import type { AiAgentToolFrame } from '#ai/chat/ai_chat_sse_adapter'

export type AiChatTurnEventMap = AiChatStreamEventMap & {
  tool_completed: Extract<AiAgentToolFrame, { event: 'tool_completed' }>['data']
  channel_progress: { content: string }
  channel_preview: { callId: string; text: string }
}

export type AiChatTurnEvent = {
  [Event in keyof AiChatTurnEventMap]: { event: Event; data: AiChatTurnEventMap[Event] }
}[keyof AiChatTurnEventMap]
