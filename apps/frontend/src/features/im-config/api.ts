import { apiRequest } from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import { readItem } from '@/lib/api-types'

export interface ImConfiguration {
  wecomBot: {
    botId: string | null
    tenantId: string | null
    wsUrl: string | null
    secretConfigured: boolean
  }
  feishuBot: {
    appId: string | null
    domain: string | null
    secretConfigured: boolean
  }
  dingtalkBot: {
    clientId: string | null
    cardTemplateId: string | null
    streamingCardTemplateId: string | null
    clientSecretConfigured: boolean
  }
  updatedAt: string | null
}

export async function getImConfiguration(token: string | null) {
  return readItem(
    await apiRequest<ApiEnvelope<ImConfiguration>>('/api/v1/system/im-config', { token })
  )
}

export async function updateImConfiguration(
  token: string | null,
  payload: Record<string, unknown>
) {
  return readItem(
    await apiRequest<ApiEnvelope<ImConfiguration>>('/api/v1/system/im-config', {
      method: 'PUT',
      token,
      body: JSON.stringify(payload),
    })
  )
}
