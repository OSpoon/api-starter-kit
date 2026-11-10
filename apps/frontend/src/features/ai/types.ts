import type { AiMessageContentStatus } from '@/components/ai-chat/AiMessageContent.vue'

import type { AiChatAgentActivity, AiChatCitation, AiChatPlanStep, AiChatTimelineItem } from './api'

export type DisplayAiChatMessage = {
  id?: string | number
  conversationId?: number
  role: 'user' | 'assistant'
  content: string
  image?: { mimeType: string }
  localImageFile?: File
  candidateContent?: string
  candidateCallId?: string
  status?: AiMessageContentStatus
  activity?: AiChatAgentActivity
  plan?: AiChatPlanStep[]
  timeline?: AiChatTimelineItem[]
}

export type LocalAiChatMessage = DisplayAiChatMessage & {
  id: string | number
  citations?: AiChatCitation[]
}
