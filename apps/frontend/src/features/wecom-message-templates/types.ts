export type WecomMessageType = 'text' | 'markdown' | 'markdown_v2'

export interface WecomMessageTemplate {
  id: number
  name: string
  description: string | null
  msgtype: WecomMessageType
  webhookKeyHint: string | null
  payload: Record<string, unknown>
  parameters: WecomTemplateParameter[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface WecomTemplateParameter {
  name: string
  type: 'string' | 'number' | 'boolean'
  required: boolean
  description?: string | null
  maxBytes?: number | null
}

export interface WecomTemplatePage {
  items: WecomMessageTemplate[]
  meta: { currentPage: number; lastPage: number }
}

export interface WecomTemplateInput {
  name: string
  description?: string | null
  msgtype: WecomMessageType
  webhookUrl?: string
  payload: Record<string, unknown>
  parameters: WecomTemplateParameter[]
  enabled: boolean
}

export interface WecomRuntimeMentions {
  mentioned_list?: string[]
  mentioned_mobile_list?: string[]
}
