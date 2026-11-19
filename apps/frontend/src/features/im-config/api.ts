import { apiRequest } from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import { readItem } from '@/lib/api-types'

export type ImBotChannel = 'wecom' | 'feishu' | 'dingtalk'

export interface ImBot {
  id: number
  name: string
  channel: ImBotChannel
  identifier: string | null
  tenantId: string | null
  endpoint: string | null
  cardTemplateId: string | null
  streamingCardTemplateId: string | null
  enabled: boolean
  secretConfigured: boolean
  updatedAt: string | null
}

export interface ImBotInput {
  name: string
  channel?: ImBotChannel
  identifier: string
  secret?: string
  tenantId?: string
  endpoint?: string
  cardTemplateId?: string
  streamingCardTemplateId?: string
}

export interface ImBotPage {
  items: ImBot[]
  meta: { currentPage: number; lastPage: number; total: number }
}

export async function listImBots(
  token: string | null,
  page: number,
  search: string,
  limit = 20,
  channels?: ImBotChannel[]
) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (search) query.set('search', search)
  if (channels?.length) query.set('channels', channels.join(','))
  return readItem(
    await apiRequest<ApiEnvelope<ImBotPage>>(`/api/v1/system/im-config?${query}`, { token })
  )
}

export async function createImBot(token: string | null, payload: ImBotInput) {
  return readItem(
    await apiRequest<ApiEnvelope<ImBot>>('/api/v1/system/im-config', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    })
  )
}

export async function updateImBot(
  token: string | null,
  id: number,
  payload: Partial<ImBotInput> & { enabled?: boolean }
) {
  return readItem(
    await apiRequest<ApiEnvelope<ImBot>>(`/api/v1/system/im-config/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(payload),
    })
  )
}
