import type { AiMessageContentStatus } from '@/components/ai-chat/AiMessageContent.vue'

import type { AiChatAgentActivity, AiChatCitation, AiChatPlanStep, AiChatTimelineItem } from './api'

export type DisplayAiChatMessage = {
  id?: string | number
  role: 'user' | 'assistant'
  content: string
  status?: AiMessageContentStatus
  activity?: AiChatAgentActivity
  plan?: AiChatPlanStep[]
  timeline?: AiChatTimelineItem[]
}

export type LocalAiChatMessage = DisplayAiChatMessage & {
  id: string
  citations?: AiChatCitation[]
}
