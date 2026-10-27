import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'

import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'

import { builtInAiAgentToolNames } from '#ai/core/ai_agent_tool_catalog'
import AiAgentConfiguration, {
  type AiAgentMcpServerConfiguration,
  type AiAgentMcpToolConfiguration,
} from '#models/ai_agent_configuration'

export type AiAgentMcpServer = AiAgentMcpServerConfiguration & { name: string }

export type AiAgentMcpProcessConfiguration = {
  command: string
  args: string[]
  cwd?: string | null
  environment?: Record<string, string>
}

export class AiAgentMcpServerNotFoundError extends Error {
  code = 'E_ROW_NOT_FOUND'
  status = 404

  constructor() {
    super('MCP 服务不存在')
    this.name = 'AiAgentMcpServerNotFoundError'
  }
}

export function assertAiAgentMcpConfiguration(input: AiAgentMcpProcessConfiguration) {
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
  return { command, args: input.args, cwd, environment }
}

export function encryptAiAgentMcpEnvironment(environment?: Record<string, string>) {
  return environment && Object.keys(environment).length
    ? encryption.encrypt(JSON.stringify(environment))
    : null
}

export function decryptAiAgentMcpEnvironment(encryptedEnvironment: string | null) {
  if (!encryptedEnvironment) return undefined
  try {
    const decrypted = encryption.decrypt<string>(encryptedEnvironment)
    if (!decrypted) throw new Error()
    const environment = JSON.parse(decrypted) as unknown
    if (
      !environment ||
      typeof environment !== 'object' ||
      Array.isArray(environment) ||
      Object.entries(environment).some(([key, value]) => typeof value !== 'string' || !key)
    ) {
      throw new Error()
    }
    return environment as Record<string, string>
  } catch {
    throw new Error('MCP 环境变量配置无法解密，请重新配置')
  }
}

export function serializeAiAgentMcpServer(server: AiAgentMcpServer) {
  return {
    id: server.id,
    name: server.name,
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    enabled: server.enabled,
    enabledTools: Object.fromEntries(
      Object.entries(server.enabledTools ?? {}).map(([name, configuration]) => [
        name,
        { mode: configuration.mode },
      ])
    ),
    environmentConfigured: Boolean(server.environment),
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
      Object.entries(servers).map(([name, server]) => [
        name,
        { command: server.command, args: server.args, cwd: server.cwd },
      ])
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
      const launchChanged =
        !existing ||
        input.environment !== undefined ||
        existing.command !== processConfiguration.command ||
        existing.cwd !== (processConfiguration.cwd ?? null) ||
        JSON.stringify(existing.args) !== JSON.stringify(processConfiguration.args)
      next[name] = {
        id: launchChanged ? randomUUID() : existing.id,
        command: processConfiguration.command,
        args: processConfiguration.args,
        cwd: processConfiguration.cwd ?? null,
        environment:
          input.environment === undefined
            ? (existing?.environment ?? null)
            : encryptAiAgentMcpEnvironment(input.environment),
        enabled: existing?.enabled ?? false,
        enabledTools: existing?.enabledTools ?? {},
        updatedAt: now,
      }
    }
    for (const name of Object.keys(servers)) delete servers[name]
    Object.assign(servers, next)
    return Object.keys(next)
      .map((name) => ({ name, ...next[name]! }))
      .map(serializeAiAgentMcpServer)
  })
}

export async function updateAiAgentMcpServer(
  id: string,
  input: { enabled?: boolean; enabledTools?: Record<string, AiAgentMcpToolConfiguration> }
) {
  return mutateMcpServers((servers) => {
    const server = serverFromConfiguration(servers, id)
    const configuration = servers[server.name]!
    if (input.enabled !== undefined) configuration.enabled = input.enabled
    if (input.enabledTools !== undefined) configuration.enabledTools = input.enabledTools
    configuration.updatedAt = new Date().toISOString()
    return serializeAiAgentMcpServer(serverFromConfiguration(servers, id))
  })
}

export async function getAiAgentMcpServer(id: string) {
  return serverFromConfiguration(await readMcpServers(), id)
}
