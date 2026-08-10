import { apiRequest } from '@/lib/api'
import { readItem } from '@/lib/api-types'

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

const auth = (token: string | null) => ({ token })

export async function listWecomTemplates(token: string | null, page = 1) {
  return readItem(
    await apiRequest<WecomTemplatePage>(
      `/api/v1/system/wecom-message-templates?page=${page}&limit=20`,
      auth(token)
    )
  )
}
export async function createWecomTemplate(token: string | null, input: WecomTemplateInput) {
  return readItem(
    await apiRequest<WecomMessageTemplate>('/api/v1/system/wecom-message-templates', {
      ...auth(token),
      method: 'POST',
      body: JSON.stringify(input),
    })
  )
}
export async function updateWecomTemplate(
  token: string | null,
  id: number,
  input: WecomTemplateInput
) {
  return readItem(
    await apiRequest<WecomMessageTemplate>(`/api/v1/system/wecom-message-templates/${id}`, {
      ...auth(token),
      method: 'PUT',
      body: JSON.stringify(input),
    })
  )
}
export async function deleteWecomTemplate(token: string | null, id: number) {
  return readItem(
    await apiRequest<{ id: number; deleted: boolean }>(
      `/api/v1/system/wecom-message-templates/${id}`,
      { ...auth(token), method: 'DELETE' }
    )
  )
}
export async function testWecomTemplate(
  token: string | null,
  id: number,
  params: Record<string, unknown>,
  mentions: WecomRuntimeMentions = {}
) {
  return readItem(
    await apiRequest<{ sent: boolean }>(`/api/v1/system/wecom-message-templates/${id}/test`, {
      ...auth(token),
      method: 'POST',
      body: JSON.stringify({ params, ...mentions }),
    })
  )
}
export async function testWecomTemplateDraft(
  token: string | null,
  msgtype: WecomMessageType,
  payload: Record<string, unknown>,
  params: Record<string, unknown>,
  mentions: WecomRuntimeMentions = {}
) {
  return readItem(
    await apiRequest<{ sent: boolean }>('/api/v1/system/wecom-message-templates/test', {
      ...auth(token),
      method: 'POST',
      body: JSON.stringify({ msgtype, payload, params, ...mentions }),
    })
  )
}
