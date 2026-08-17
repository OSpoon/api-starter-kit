export interface AiAgentMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  id?: number
  summaryCandidateBoundaryId?: number
}
