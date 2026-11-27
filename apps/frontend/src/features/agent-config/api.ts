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

export interface AgentToolConfiguration {
  tools: AgentToolSetting[]
  mineru: { source: 'web' | null; maskedToken: string | null }
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

export interface AgentMcpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  readOnlyHint: boolean
}

export interface AgentMcpServer {
  id: string
  name: string
  type: 'stdio' | 'http'
  command: string | null
  args: string[]
  cwd: string | null
  url: string | null
  enabled: boolean
  environmentConfigured: boolean
  headersConfigured: boolean
  updatedAt: string
}

export type AgentMcpProcessConfiguration =
  | {
      type?: 'stdio'
      command: string
      args: string[]
      cwd?: string | null
      env?: Record<string, string>
      inheritEnv?: boolean
      stderr?: 'pipe' | 'inherit'
      maxMessageBytes?: number
      maxStderrBytes?: number
      closeTimeoutMs?: number
    }
  | {
      type: 'http'
      url: string
      headers?: Record<string, string>
      openGetStream?: boolean
      maxMessageBytes?: number
      reconnect?: { initialDelayMs?: number; maxDelayMs?: number; maxRetries?: number }
    }

export interface AgentMcpConfigurationDocument {
  mcpServers: Record<string, AgentMcpProcessConfiguration>
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
    await apiRequest<ApiEnvelope<AgentToolConfiguration>>('/api/v1/system/agent-config', {
      token,
    })
  )
}

export async function updateAgentTools(token: string | null, tools: AgentToolSetting[]) {
  return readItem(
    await apiRequest<ApiEnvelope<AgentToolConfiguration>>('/api/v1/system/agent-config', {
      method: 'PUT',
      token,
      body: JSON.stringify({ tools }),
    })
  )
}

export async function updateMineruToken(
  token: string | null,
  value: string | null | undefined,
  enable: boolean
) {
  return readItem(
    await apiRequest<ApiEnvelope<AgentToolConfiguration>>('/api/v1/system/agent-config/mineru', {
      method: 'PUT',
      token,
      body: JSON.stringify({ token: value, enable }),
    })
  )
}

export function listAgentSkills(token: string | null, page: number) {
  return getModulePage<AgentSkill>(token, 'skills', page)
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

export async function updateAgentMcpServer(token: string | null, id: string, enabled: boolean) {
  return readItem(
    await apiRequest<ApiEnvelope<AgentMcpServer>>(
      `/api/v1/system/agent-config/mcp-servers/${encodeURIComponent(id)}`,
      { method: 'PUT', token, body: JSON.stringify({ enabled }) }
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

export async function installAgentSkills(token: string | null, source: string | File) {
  const zip = new FormData()
  if (typeof source !== 'string') zip.append('file', source)
  const body = typeof source === 'string' ? JSON.stringify({ source }) : zip
  return readItem(
    await apiRequest<ApiEnvelope<{ installed: Array<Pick<AgentSkill, 'code' | 'name'>> }>>(
      typeof source === 'string'
        ? '/api/v1/system/agent-config/skills'
        : '/api/v1/system/agent-config/skills/zip',
      { method: 'POST', token, body }
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
