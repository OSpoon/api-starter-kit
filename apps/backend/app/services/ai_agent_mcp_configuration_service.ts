import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'

import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'

import { builtInAiAgentToolNames } from '#ai/core/ai_agent_tool_catalog'
import AiAgentConfiguration, {
  type AiAgentMcpServerConfiguration,
} from '#models/ai_agent_configuration'

export type AiAgentMcpServer = AiAgentMcpServerConfiguration & { name: string }

export type AiAgentMcpReconnectConfiguration = {
  initialDelayMs?: number
  maxDelayMs?: number
  maxRetries?: number
}

export type AiAgentMcpProcessConfiguration =
  | {
      type?: 'stdio'
      command: string
      args: string[]
      cwd?: string | null
      environment?: Record<string, string>
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
      reconnect?: AiAgentMcpReconnectConfiguration
    }

export class AiAgentMcpServerNotFoundError extends Error {
  code = 'E_ROW_NOT_FOUND'
  status = 404

  constructor() {
    super('MCP 服务不存在')
    this.name = 'AiAgentMcpServerNotFoundError'
  }
}

function assertIntegerOption(value: number | undefined, name: string, min: number, max: number) {
  if (value !== undefined && (!Number.isInteger(value) || value < min || value > max)) {
    throw new Error(`MCP ${name} 无效`)
  }
}

export function assertAiAgentMcpConfiguration(input: AiAgentMcpProcessConfiguration) {
  assertIntegerOption(input.maxMessageBytes, '消息大小限制', 1, 64 * 1024 * 1024)
  if (input.type === 'http') {
    assertIntegerOption(input.reconnect?.initialDelayMs, '重连初始延迟', 0, 30_000)
    assertIntegerOption(input.reconnect?.maxDelayMs, '重连最大延迟', 0, 120_000)
    assertIntegerOption(input.reconnect?.maxRetries, '重连次数', 0, 20)
    let url: URL
    try {
      url = new URL(input.url)
    } catch {
      throw new Error('MCP URL 无效')
    }
    const headers = input.headers ?? {}
    const seenHeaders = new Set<string>()
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.hash ||
      input.url.includes('#') ||
      input.url.length > 2048 ||
      url.href
        .slice(url.protocol.length + 2)
        .split(/[/?#]/, 1)[0]
        .includes('@') ||
      Object.keys(headers).length > 50 ||
      JSON.stringify(headers).length > 200_000 ||
      Object.entries(headers).some(([name, value]) => {
        const normalizedName = name.toLowerCase()
        if (
          !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
          seenHeaders.has(normalizedName) ||
          value.length > 10_000 ||
          /[\r\n\0]/.test(value)
        ) {
          return true
        }
        seenHeaders.add(normalizedName)
        return false
      })
    ) {
      throw new Error('MCP HTTP URL 或请求头无效')
    }
    return {
      type: 'http' as const,
      url: url.toString(),
      headers,
      openGetStream: input.openGetStream,
      maxMessageBytes: input.maxMessageBytes,
      reconnect: input.reconnect,
    }
  }

  assertIntegerOption(input.maxStderrBytes, '错误输出大小限制', 1, 1024 * 1024)
  assertIntegerOption(input.closeTimeoutMs, '关闭超时', 0, 60_000)
  const command = input.command.trim()
  const cwd = input.cwd?.trim() || undefined
  if (
    (!isAbsolute(command) && !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(command)) ||
    command.includes('\0')
  ) {
    throw new Error('MCP 命令必须是服务器上的绝对路径或 PATH 中的命令名')
  }
  if (cwd && (!isAbsolute(cwd) || cwd.includes('\0'))) {
    throw new Error('MCP 工作目录必须是服务器上的绝对路径')
  }
  if (input.args.length > 100 || input.args.some((argument) => argument.includes('\0'))) {
    throw new Error('MCP 参数数量过多或包含无效字符')
  }
  const environment = input.environment ?? {}
  const serializedEnvironment = JSON.stringify(environment)
  if (
    Object.keys(environment).length > 100 ||
    serializedEnvironment.length > 200_000 ||
    Object.entries(environment).some(
      ([key, value]) =>
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
        key.length > 128 ||
        value.length > 10_000 ||
        value.includes('\0')
    )
  ) {
    throw new Error('MCP 环境变量无效')
  }
  return {
    type: 'stdio' as const,
    command,
    args: input.args,
    cwd,
    environment,
    inheritEnv: input.inheritEnv,
    stderr: input.stderr,
    maxMessageBytes: input.maxMessageBytes,
    maxStderrBytes: input.maxStderrBytes,
    closeTimeoutMs: input.closeTimeoutMs,
  }
}

export function encryptAiAgentMcpSecrets(secrets?: Record<string, string>) {
  return secrets && Object.keys(secrets).length ? encryption.encrypt(JSON.stringify(secrets)) : null
}

export function decryptAiAgentMcpSecrets(encryptedSecrets: string | null | undefined) {
  if (!encryptedSecrets) return undefined
  try {
    const decrypted = encryption.decrypt<string>(encryptedSecrets)
    if (!decrypted) throw new Error()
    const secrets = JSON.parse(decrypted) as unknown
    if (
      !secrets ||
      typeof secrets !== 'object' ||
      Array.isArray(secrets) ||
      Object.entries(secrets).some(([key, value]) => typeof value !== 'string' || !key)
    ) {
      throw new Error()
    }
    return secrets as Record<string, string>
  } catch {
    throw new Error('MCP 密钥配置无法解密，请重新配置')
  }
}

export function serializeAiAgentMcpServer(server: AiAgentMcpServer) {
  const transport = server.transport ?? 'stdio'
  return {
    id: server.id,
    name: server.name,
    type: transport,
    command: transport === 'stdio' ? (server.command ?? '') : null,
    args: transport === 'stdio' ? (server.args ?? []) : [],
    cwd: transport === 'stdio' ? (server.cwd ?? null) : null,
    url: transport === 'http' ? (server.url ?? null) : null,
    enabled: server.enabled,
    environmentConfigured: Boolean(server.environment),
    headersConfigured: Boolean(server.headers),
    updatedAt: server.updatedAt,
  }
}

async function mutateMcpServers<T>(
  mutate: (servers: Record<string, AiAgentMcpServerConfiguration>) => T
) {
  return db.transaction(async (trx) => {
    const now = new Date()
    await trx
      .table('ai_agent_configurations')
      .insert({
        id: 1,
        enabled_tools: JSON.stringify(builtInAiAgentToolNames),
        tool_modes: JSON.stringify({}),
        mcp_servers: JSON.stringify({}),
        created_at: now,
        updated_at: now,
      })
      .onConflict('id')
      .ignore()
    const configuration = await AiAgentConfiguration.query({ client: trx })
      .where('id', 1)
      .forUpdate()
      .firstOrFail()
    const servers = structuredClone(configuration.mcpServers ?? {})
    const result = mutate(servers)
    configuration.mcpServers = servers
    await configuration.save()
    return result
  })
}

function serverFromConfiguration(
  servers: Record<string, AiAgentMcpServerConfiguration>,
  id: string
): AiAgentMcpServer {
  const entry = Object.entries(servers).find(([, server]) => server.id === id)
  if (!entry) throw new AiAgentMcpServerNotFoundError()
  return { name: entry[0], ...entry[1] }
}

async function readMcpServers() {
  const configuration = await AiAgentConfiguration.find(1)
  return configuration?.mcpServers ?? {}
}

export async function listAiAgentMcpServers(page: number, limit: number) {
  const servers = Object.entries(await readMcpServers())
    .map(([name, configuration]) => ({ name, ...configuration }))
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name)
    )
  const total = servers.length
  const lastPage = Math.max(1, Math.ceil(total / limit))
  return {
    items: servers.slice((page - 1) * limit, page * limit).map(serializeAiAgentMcpServer),
    meta: { total, perPage: limit, currentPage: page, lastPage },
  }
}

export async function listEnabledAiAgentMcpServers() {
  return Object.entries(await readMcpServers())
    .filter(([, server]) => server.enabled)
    .map(([name, server]) => ({ name, ...server }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

export async function getAiAgentMcpConfiguration() {
  const servers = await readMcpServers()
  return {
    mcpServers: Object.fromEntries(
      Object.entries(servers).map(([name, server]) => {
        if ((server.transport ?? 'stdio') === 'http') {
          return [
            name,
            {
              type: 'http',
              url: server.url ?? '',
              openGetStream: server.openGetStream,
              maxMessageBytes: server.maxMessageBytes,
              reconnect: server.reconnect,
            },
          ]
        }
        return [
          name,
          {
            type: 'stdio',
            command: server.command ?? '',
            args: server.args ?? [],
            cwd: server.cwd ?? null,
            inheritEnv: server.inheritEnv ?? false,
            stderr: server.stderr ?? 'pipe',
            maxMessageBytes: server.maxMessageBytes,
            maxStderrBytes: server.maxStderrBytes,
            closeTimeoutMs: server.closeTimeoutMs,
          },
        ]
      })
    ),
  }
}

export async function replaceAiAgentMcpConfiguration(
  entries: Record<string, AiAgentMcpProcessConfiguration>
) {
  return mutateMcpServers((servers) => {
    const now = new Date().toISOString()
    const next: Record<string, AiAgentMcpServerConfiguration> = {}
    for (const [name, input] of Object.entries(entries)) {
      if (!name.trim() || name.length > 128) throw new Error('MCP 服务名称无效')
      const processConfiguration = assertAiAgentMcpConfiguration(input)
      const existing = servers[name]
      const existingTransport = existing?.transport ?? 'stdio'
      if (processConfiguration.type === 'http') {
        const headersSupplied = 'headers' in input && input.headers !== undefined
        const launchChanged =
          !existing ||
          existingTransport !== 'http' ||
          headersSupplied ||
          existing.url !== processConfiguration.url ||
          existing.openGetStream !== processConfiguration.openGetStream ||
          existing.maxMessageBytes !== processConfiguration.maxMessageBytes ||
          JSON.stringify(existing.reconnect ?? {}) !==
            JSON.stringify(processConfiguration.reconnect ?? {})
        next[name] = {
          id: launchChanged ? randomUUID() : (existing?.id ?? randomUUID()),
          transport: 'http',
          url: processConfiguration.url,
          openGetStream: processConfiguration.openGetStream,
          maxMessageBytes: processConfiguration.maxMessageBytes,
          reconnect: processConfiguration.reconnect,
          headers:
            !headersSupplied && existingTransport === 'http'
              ? (existing?.headers ?? null)
              : encryptAiAgentMcpSecrets(processConfiguration.headers),
          enabled: existing?.enabled ?? false,
          updatedAt: now,
        }
      } else {
        const environmentSupplied = 'environment' in input && input.environment !== undefined
        const launchChanged =
          !existing ||
          existingTransport !== 'stdio' ||
          environmentSupplied ||
          existing.command !== processConfiguration.command ||
          existing.cwd !== (processConfiguration.cwd ?? null) ||
          JSON.stringify(existing.args ?? []) !== JSON.stringify(processConfiguration.args) ||
          existing.maxMessageBytes !== processConfiguration.maxMessageBytes ||
          (existing.inheritEnv ?? false) !== (processConfiguration.inheritEnv ?? false) ||
          (existing.stderr ?? 'pipe') !== (processConfiguration.stderr ?? 'pipe') ||
          existing.maxStderrBytes !== processConfiguration.maxStderrBytes ||
          existing.closeTimeoutMs !== processConfiguration.closeTimeoutMs
        next[name] = {
          id: launchChanged ? randomUUID() : (existing?.id ?? randomUUID()),
          transport: 'stdio',
          command: processConfiguration.command,
          args: processConfiguration.args,
          cwd: processConfiguration.cwd ?? null,
          inheritEnv: processConfiguration.inheritEnv ?? false,
          stderr: processConfiguration.stderr ?? 'pipe',
          maxMessageBytes: processConfiguration.maxMessageBytes,
          maxStderrBytes: processConfiguration.maxStderrBytes,
          closeTimeoutMs: processConfiguration.closeTimeoutMs,
          environment:
            !environmentSupplied && existingTransport === 'stdio'
              ? (existing?.environment ?? null)
              : encryptAiAgentMcpSecrets(processConfiguration.environment),
          enabled: existing?.enabled ?? false,
          updatedAt: now,
        }
      }
    }
    for (const name of Object.keys(servers)) delete servers[name]
    Object.assign(servers, next)
    return Object.keys(next)
      .map((name) => ({ name, ...next[name]! }))
      .map(serializeAiAgentMcpServer)
  })
}

export async function updateAiAgentMcpServer(id: string, input: { enabled: boolean }) {
  return mutateMcpServers((servers) => {
    const server = serverFromConfiguration(servers, id)
    const configuration = servers[server.name]!
    configuration.enabled = input.enabled
    configuration.updatedAt = new Date().toISOString()
    return serializeAiAgentMcpServer(serverFromConfiguration(servers, id))
  })
}

export async function getAiAgentMcpServer(id: string) {
  return serverFromConfiguration(await readMcpServers(), id)
}
