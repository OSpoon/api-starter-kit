import { apiRequest } from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import { readItem } from '@/lib/api-types'

export interface LlmConfiguration {
  chat: { baseUrl: string | null; model: string; apiKeyConfigured: boolean }
  asr: { baseUrl: string | null; model: string; apiKeyConfigured: boolean }
  embedding: {
    baseUrl: string | null
    model: string | null
    dimensions: number
    apiKeyConfigured: boolean
  }
  requestTimeoutMs: number
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

export async function getLlmConfiguration(token: string | null) {
  return readItem(
    await apiRequest<ApiEnvelope<LlmConfiguration>>('/api/v1/system/llm-config', { token })
  )
}

export async function updateLlmConfiguration(
  token: string | null,
  payload: Record<string, unknown>
) {
  return readItem(
    await apiRequest<ApiEnvelope<LlmConfiguration>>('/api/v1/system/llm-config', {
      method: 'PUT',
      token,
      body: JSON.stringify(payload),
    })
  )
}

export async function testLlmConfiguration(token: string | null) {
  await apiRequest('/api/v1/system/llm-config/test', { method: 'POST', token })
}
