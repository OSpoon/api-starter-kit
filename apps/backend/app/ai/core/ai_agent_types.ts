export interface AiAgentImage {
  data: string
  mimeType: string
}

export interface AiAgentMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  id?: number
  image?: AiAgentImage
}
