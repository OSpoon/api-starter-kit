import { apiRequest } from '@/lib/api'
import { readItem } from '@/lib/api-types'

import type {
  WecomMessageTemplate,
  WecomMessageType,
  WecomRuntimeMentions,
  WecomTemplateInput,
  WecomTemplatePage,
} from './types'

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

export async function sendWecomTemplate(
  token: string | null,
  id: number,
  params: Record<string, unknown>,
  mentions: WecomRuntimeMentions = {}
) {
  return readItem(
    await apiRequest<{ sent: boolean }>(`/api/v1/system/wecom-messages/${id}/send`, {
      ...auth(token),
      method: 'POST',
      body: JSON.stringify({ params, ...mentions }),
    })
  )
}

export function buildWecomTemplateCurl(
  template: WecomMessageTemplate,
  baseUrl = window.location.origin
) {
  const params = Object.fromEntries(template.parameters.map((parameter) => [parameter.name, '']))
  const body: Record<string, unknown> = { params }
  if (template.msgtype === 'text') {
    body.mentioned_list = []
    body.mentioned_mobile_list = []
  }
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/wecom-messages/${template.id}/send`
  return [
    `curl --request POST '${url}' \\`,
    "  --header 'Content-Type: application/json' \\",
    "  --header 'X-API-Key: YOUR_API_KEY' \\",
    `  --data-raw '${JSON.stringify(body, null, 2)}'`,
  ].join('\n')
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
