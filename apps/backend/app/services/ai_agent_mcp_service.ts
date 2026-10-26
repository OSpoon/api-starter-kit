import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'

import encryption from '@adonisjs/core/services/encryption'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { TSchema } from '@earendil-works/pi-ai'
import { type ToolCall, Type, validateToolArguments } from '@earendil-works/pi-ai'
import { McpClient, StdioTransport, toLlmContent } from '@earendil-works/pi-mcp'

import { builtInAiAgentToolNames } from '#ai/core/ai_agent_tool_catalog'
import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { sanitizeAiAgentToolErrorMessage } from '#ai/core/ai_agent_tool_errors'
import AiAgentConfiguration, {
  type AiAgentMcpServerConfiguration,
  type AiAgentMcpToolConfiguration,
} from '#models/ai_agent_configuration'
import { recordAuditEvent } from '#services/audit_log'

export type AiAgentMcpServer = AiAgentMcpServerConfiguration & { name: string }

export type AiAgentMcpToolInfo = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  readOnlyHint: boolean
}

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

function createClient(input: AiAgentMcpProcessConfiguration) {
  const configuration = assertAiAgentMcpConfiguration(input)
  const client = new McpClient({
    name: 'api-starter-agent',
    version: '1.0.0',
    requestTimeoutMs: 15_000,
  })
  const transport = new StdioTransport({
    command: configuration.command,
    args: configuration.args,
    cwd: configuration.cwd,
    env: { PATH: process.env.PATH ?? '', ...configuration.environment },
    inheritEnv: false,
  })
  return { client, transport }
}

export async function discoverAiAgentMcpTools(input: AiAgentMcpProcessConfiguration) {
  const { client, transport } = createClient(input)
  try {
    await client.connect(transport)
    const tools = await client.listTools()
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? tool.title ?? tool.name,
      inputSchema: tool.inputSchema as Record<string, unknown>,
      readOnlyHint: tool.annotations?.readOnlyHint === true,
    }))
  } finally {
    await client.close()
  }
}

export async function discoverAiAgentMcpServerTools(server: AiAgentMcpServer) {
  return discoverAiAgentMcpTools({
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    environment: decryptAiAgentMcpEnvironment(server.environment),
  })
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

function parametersFor(tool: AiAgentMcpToolInfo) {
  if (tool.inputSchema.type !== 'object') throw new Error('MCP 工具必须声明对象类型参数')
  return Type.Unsafe({
    ...tool.inputSchema,
    type: 'object',
    properties:
      tool.inputSchema.properties &&
      typeof tool.inputSchema.properties === 'object' &&
      !Array.isArray(tool.inputSchema.properties)
        ? tool.inputSchema.properties
        : {},
  } as TSchema)
}

export function validateAiAgentMcpArguments(
  tool: AiAgentMcpToolInfo,
  args: Record<string, unknown>
) {
  try {
    return validateToolArguments(
      { name: tool.name, description: tool.description, parameters: parametersFor(tool) },
      {
        type: 'toolCall',
        id: 'mcp-validation',
        name: tool.name,
        arguments: args,
      } as ToolCall
    ) as Record<string, unknown>
  } catch {
    throw new Error('MCP 工具参数不符合服务端声明的结构')
  }
}

async function invokeMcpTool(input: {
  server: AiAgentMcpServer
  toolName: string
  args: Record<string, unknown>
  signal?: AbortSignal
}) {
  const { client, transport } = createClient({
    command: input.server.command,
    args: input.server.args,
    cwd: input.server.cwd,
    environment: decryptAiAgentMcpEnvironment(input.server.environment),
  })
  try {
    await client.connect(transport)
    return await client.callTool(input.toolName, input.args, { signal: input.signal })
  } finally {
    await client.close()
  }
}

export async function callConfiguredAiAgentMcpTool(input: {
  serverId: string
  toolName: string
  args: Record<string, unknown>
  mode: AiAgentMcpToolConfiguration['mode']
  userId: number
  auditContext?: AiAgentToolContext['auditContext']
  signal?: AbortSignal
}) {
  const startedAt = performance.now()
  let server: AiAgentMcpServer | undefined
  try {
    server = await getAiAgentMcpServer(input.serverId)
    const configuration = server.enabledTools?.[input.toolName]
    if (!server.enabled || configuration?.mode !== input.mode) {
      throw new Error('MCP 工具已停用或配置已变更')
    }
    const discoveredTools = await discoverAiAgentMcpServerTools(server)
    const tool = discoveredTools.find(({ name }) => name === input.toolName)
    if (!tool) throw new Error('MCP 服务未提供此工具')
    if (input.mode === 'read' && !tool.readOnlyHint) {
      throw new Error('MCP 工具未声明只读，必须改为确认后执行')
    }
    const args = validateAiAgentMcpArguments(tool, input.args)
    const result = await invokeMcpTool({
      server,
      toolName: input.toolName,
      args,
      signal: input.signal,
    })
    await recordAuditEvent(input.auditContext, {
      actorUserId: input.userId,
      source: 'ai_agent',
      outcome: result.isError ? 'failure' : 'success',
      reasonCode: result.isError ? 'mcp_tool_failed' : undefined,
      action: result.isError ? 'agent.mcp_tool_failed' : 'agent.mcp_tool_executed',
      targetType: 'mcp_server_tool',
      targetId: `${server.id}:${input.toolName}`,
      metadata: {
        serverId: server.id,
        toolName: input.toolName,
        parameterNames: Object.keys(args),
        durationMs: Math.round(performance.now() - startedAt),
      },
    })
    return { result, server }
  } catch (error) {
    await recordAuditEvent(input.auditContext, {
      actorUserId: input.userId,
      source: 'ai_agent',
      outcome: 'failure',
      reasonCode: 'mcp_tool_failed',
      action: 'agent.mcp_tool_failed',
      targetType: 'mcp_server_tool',
      targetId: `${input.serverId}:${input.toolName}`,
      metadata: {
        serverId: input.serverId,
        toolName: input.toolName,
        parameterNames: Object.keys(input.args),
        durationMs: Math.round(performance.now() - startedAt),
      },
    })
    throw error
  }
}

function getAiToolName(serverId: string, toolName: string, mode: string) {
  const readableName = toolName.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40)
  const suffix = createHash('sha256').update(toolName).digest('hex').slice(0, 8)
  return `mcp_${mode}_${serverId}_${readableName}_${suffix}`
}

export async function createConfiguredMcpAgentTools(
  servers: AiAgentMcpServer[],
  context: AiAgentToolContext
): Promise<AgentTool[]> {
  const tools: AgentTool[] = []
  for (const server of servers) {
    if (!server.enabled || !Object.keys(server.enabledTools ?? {}).length) continue
    let discoveredTools: AiAgentMcpToolInfo[]
    try {
      discoveredTools = await discoverAiAgentMcpServerTools(server)
    } catch (error) {
      logger.warn(
        { serverId: server.id, errorName: error instanceof Error ? error.name : 'UnknownError' },
        'Unable to load configured MCP tools'
      )
      await recordAuditEvent(context.auditContext, {
        actorUserId: context.userId,
        source: 'ai_agent',
        outcome: 'failure',
        reasonCode: 'mcp_discovery_failed',
        action: 'agent.mcp_tool_discovery_failed',
        targetType: 'mcp_server',
        targetId: server.id,
        metadata: { serverId: server.id },
      })
      continue
    }

    for (const tool of discoveredTools) {
      const configuration = server.enabledTools?.[tool.name]
      if (!configuration?.mode) continue
      const mode = configuration.mode
      let parameters: TSchema
      try {
        parameters = parametersFor(tool)
      } catch (error) {
        logger.warn(
          {
            serverId: server.id,
            toolName: tool.name,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          },
          'Skipping MCP tool with an invalid input schema'
        )
        await recordAuditEvent(context.auditContext, {
          actorUserId: context.userId,
          source: 'ai_agent',
          outcome: 'failure',
          reasonCode: 'mcp_tool_schema_invalid',
          action: 'agent.mcp_tool_schema_rejected',
          targetType: 'mcp_server_tool',
          targetId: `${server.id}:${tool.name}`,
          metadata: { serverId: server.id, toolName: tool.name },
        })
        continue
      }
      const name = getAiToolName(server.id, tool.name, mode)
      const agentTool: AgentTool & {
        prepareConfirmation?: (args: unknown) => Promise<unknown>
      } = {
        name,
        label: `${server.name}: ${tool.name}`,
        description: `${tool.description} Local MCP server: ${server.name}. Execution policy: ${mode === 'read' ? 'direct execution' : 'user confirmation required'}.`,
        parameters,
        executionMode: 'sequential',
        ...(mode === 'confirm'
          ? {
              prepareConfirmation: async (params: unknown) => {
                if (!params || typeof params !== 'object' || Array.isArray(params)) {
                  throw new Error('MCP 工具参数必须是对象')
                }
                const { proposeAiAgentAction } = await import('#ai/core/ai_agent_confirmation')
                return proposeAiAgentAction({
                  action: 'call_mcp_tool',
                  actionInput: {
                    serverId: server.id,
                    toolName: tool.name,
                    arguments: params as Record<string, unknown>,
                  },
                  conversationId: context.conversationId,
                  userId: context.userId,
                  agentRunId: context.agentRunId,
                })
              },
            }
          : {}),
        execute: async (_toolCallId, params, signal) => {
          if (mode === 'confirm') {
            throw new Error('MCP 工具确认应在执行前完成')
          }

          if (signal?.aborted) throw new DOMException('AI request was cancelled', 'AbortError')
          try {
            const { result } = await callConfiguredAiAgentMcpTool({
              serverId: server.id,
              toolName: tool.name,
              args: params as Record<string, unknown>,
              mode,
              userId: context.userId,
              auditContext: context.auditContext,
              signal,
            })
            const details = result.isError
              ? {
                  kind: 'action_error',
                  code: 'failed',
                  message:
                    sanitizeAiAgentToolErrorMessage(
                      result.content
                        .filter((block) => block.type === 'text')
                        .map((block) => block.text)
                        .join('\n')
                    ) ?? 'MCP 工具执行失败',
                  toolName: tool.name,
                }
              : { kind: 'mcp_tool_result', serverId: server.id, toolName: tool.name }
            return {
              content: toLlmContent(result),
              details,
            }
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') throw error
            const message =
              sanitizeAiAgentToolErrorMessage(error instanceof Error ? error.message : undefined) ??
              'MCP 工具执行失败'
            return {
              content: [{ type: 'text', text: message }],
              details: {
                kind: 'action_error',
                code: 'failed',
                message,
                toolName: tool.name,
              },
            }
          }
        },
      }
      tools.push(agentTool)
    }
  }
  return tools
}
