import { apiRequest } from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import { readItem } from '@/lib/api-types'

export interface LlmConfiguration {
  chat: {
    baseUrl: string | null
    model: string
    contextWindow: number
    maxTokens: number
    apiKeyConfigured: boolean
  }
  asr: { baseUrl: string | null; model: string; apiKeyConfigured: boolean }
  embedding: {
    baseUrl: string | null
    model: string | null
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

export interface AgentSkillSummary {
  id: number
  code: string
  name: string
  description: string
  enabled: boolean
  updatedAt: string
}

export interface AgentSkill extends AgentSkillSummary {
  instructions: string
}

export type AgentSkillInput = Pick<AgentSkill, 'code' | 'name' | 'instructions'>

export interface AgentMcpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  readOnlyHint: boolean
}

export interface AgentMcpServer {
  id: string
  name: string
  command: string
  args: string[]
  cwd: string | null
  enabled: boolean
  enabledTools: Record<string, { mode: 'read' | 'confirm' }>
  environmentConfigured: boolean
  updatedAt: string
}

export interface AgentMcpProcessConfiguration {
  command: string
  args: string[]
  cwd?: string | null
  env?: Record<string, string>
}

export interface AgentMcpConfigurationDocument {
  mcpServers: Record<string, AgentMcpProcessConfiguration>
}

export interface AgentModulePage<T> {
  items: T[]
  meta: { currentPage: number; perPage: number; lastPage: number; total: number }
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
  return getModulePage<AgentSkillSummary>(token, 'skills', page)
}

export async function getAgentSkill(token: string | null, id: number) {
  return readItem(
    await apiRequest<ApiEnvelope<AgentSkill>>(`/api/v1/system/agent-config/skills/${id}`, { token })
  )
}

export async function createAgentSkill(
  token: string | null,
  payload: AgentSkillInput & { enabled: boolean }
) {
  return readItem(
    await apiRequest<ApiEnvelope<AgentSkill>>('/api/v1/system/agent-config/skills', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    })
  )
}

export async function updateAgentSkill(
  token: string | null,
  id: number,
  payload: Partial<AgentSkillInput> & Partial<Pick<AgentSkill, 'enabled'>>
) {
  return readItem(
    await apiRequest<ApiEnvelope<AgentSkill>>(`/api/v1/system/agent-config/skills/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(payload),
    })
  )
}

export async function deleteAgentSkill(token: string | null, id: number) {
  await apiRequest(`/api/v1/system/agent-config/skills/${id}`, { method: 'DELETE', token })
}

export function listAgentMcpServers(token: string | null, page: number) {
  return getModulePage<AgentMcpServer>(token, 'mcp-servers', page)
}

export async function getAgentMcpConfiguration(token: string | null) {
  return readItem(
    await apiRequest<ApiEnvelope<AgentMcpConfigurationDocument>>(
      '/api/v1/system/agent-config/mcp-servers/configuration',
      { token }
    )
  )
}

export async function saveAgentMcpConfiguration(
  token: string | null,
  configuration: AgentMcpConfigurationDocument
) {
  return readItem(
    await apiRequest<ApiEnvelope<{ items: AgentMcpServer[] }>>(
      '/api/v1/system/agent-config/mcp-servers/configuration',
      { method: 'PUT', token, body: JSON.stringify(configuration) }
    )
  )
}

export async function testAgentMcpConnection(
  token: string | null,
  payload: AgentMcpProcessConfiguration & { serverId?: string }
) {
  return readItem(
    await apiRequest<ApiEnvelope<{ tools: AgentMcpTool[] }>>(
      '/api/v1/system/agent-config/mcp-servers/test',
      { method: 'POST', token, body: JSON.stringify(payload) }
    )
  )
}

export async function updateAgentMcpServer(
  token: string | null,
  id: string,
  payload: Partial<Pick<AgentMcpServer, 'enabled' | 'enabledTools'>>
) {
  return readItem(
    await apiRequest<ApiEnvelope<AgentMcpServer>>(
      `/api/v1/system/agent-config/mcp-servers/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        token,
        body: JSON.stringify(payload),
      }
    )
  )
}

export async function discoverAgentMcpTools(token: string | null, id: string) {
  return readItem(
    await apiRequest<ApiEnvelope<{ tools: AgentMcpTool[]; server: AgentMcpServer }>>(
      `/api/v1/system/agent-config/mcp-servers/${encodeURIComponent(id)}/discover`,
      { method: 'POST', token }
    )
  )
}
