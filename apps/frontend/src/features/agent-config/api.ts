import { apiRequest } from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import { readItem } from '@/lib/api-types'

export interface LlmConfiguration {
  chat: {
    baseUrl: string | null
    model: string
    contextWindow: number
    maxTokens: number
    reasoningLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    apiKeyConfigured: boolean
  }
  asr: { baseUrl: string | null; model: string; apiKeyConfigured: boolean }
  embedding: {
    baseUrl: string | null
    model: string
    dimensions: number
    apiKeyConfigured: boolean
  }
  updatedAt: string | null
}

export interface UpdateLlmConfigurationInput {
  chatApiKey?: string
  chatBaseUrl: string
  chatModel: string
  chatContextWindow: number
  chatMaxTokens: number
  chatReasoningLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  asrApiKey?: string
  asrBaseUrl: string
  asrModel: string
  embeddingApiKey?: string
  embeddingBaseUrl: string
  embeddingModel: string
  embeddingDimensions: 1024
}

export type LlmServiceName = 'chat' | 'asr' | 'embedding'

export interface LlmConnectionTestResult {
  ok: boolean
  failedServices: LlmServiceName[]
}

export async function getLlmConfiguration(token: string | null) {
  return readItem(
    await apiRequest<ApiEnvelope<LlmConfiguration>>('/api/v1/system/agent-config/llm', { token })
  )
}

export async function updateLlmConfiguration(
  token: string | null,
  payload: UpdateLlmConfigurationInput
) {
  return readItem(
    await apiRequest<ApiEnvelope<LlmConfiguration>>('/api/v1/system/agent-config/llm', {
      method: 'PUT',
      token,
      body: JSON.stringify(payload),
    })
  )
}

export async function testLlmConfiguration(token: string | null, service: LlmServiceName) {
  return readItem(
    await apiRequest<ApiEnvelope<LlmConnectionTestResult>>('/api/v1/system/agent-config/llm/test', {
      method: 'POST',
      token,
      body: JSON.stringify({ service }),
    })
  )
}

export interface AgentToolSetting {
  code: string
  enabled: boolean
  mode: 'direct' | 'confirm'
  modeConfigurable: boolean
  requiresConfirmation: boolean
}

export interface AgentModulePage<T> {
  items: T[]
  meta: { currentPage: number; perPage: number; lastPage: number; total: number }
}

export interface AgentSkill {
  code: string
  name: string
  description: string
  enabled: boolean
  updatedAt: string
}

async function getModulePage<T>(token: string | null, path: string, page: number) {
  const query = new URLSearchParams({ page: String(page), limit: '100' })
  return readItem(
    await apiRequest<ApiEnvelope<AgentModulePage<T>>>(
      `/api/v1/system/agent-config/${path}?${query}`,
      {
        token,
      }
    )
  )
}

export async function getAgentTools(token: string | null) {
  return readItem(
    await apiRequest<ApiEnvelope<{ tools: AgentToolSetting[] }>>('/api/v1/system/agent-config', {
      token,
    })
  )
}

export async function updateAgentTools(token: string | null, tools: AgentToolSetting[]) {
  return readItem(
    await apiRequest<ApiEnvelope<{ tools: AgentToolSetting[] }>>('/api/v1/system/agent-config', {
      method: 'PUT',
      token,
      body: JSON.stringify({ tools }),
    })
  )
}

export function listAgentSkills(token: string | null, page: number) {
  return getModulePage<AgentSkill>(token, 'skills', page)
}

export async function installAgentSkills(token: string | null, source: string) {
  return readItem(
    await apiRequest<ApiEnvelope<{ installed: Array<Pick<AgentSkill, 'code' | 'name'>> }>>(
      '/api/v1/system/agent-config/skills',
      { method: 'POST', token, body: JSON.stringify({ source }) }
    )
  )
}

export async function updateAgentSkill(token: string | null, code: string, enabled: boolean) {
  return readItem(
    await apiRequest<ApiEnvelope<AgentSkill>>(
      `/api/v1/system/agent-config/skills/${encodeURIComponent(code)}`,
      { method: 'PUT', token, body: JSON.stringify({ enabled }) }
    )
  )
}

export async function removeAgentSkill(token: string | null, code: string) {
  return readItem(
    await apiRequest<ApiEnvelope<{ code: string; removed: boolean }>>(
      `/api/v1/system/agent-config/skills/${encodeURIComponent(code)}`,
      { method: 'DELETE', token }
    )
  )
}
