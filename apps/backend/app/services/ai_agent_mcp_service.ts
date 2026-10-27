import { createHash } from 'node:crypto'

import logger from '@adonisjs/core/services/logger'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { TSchema } from '@earendil-works/pi-ai'
import { type ToolCall, Type, validateToolArguments } from '@earendil-works/pi-ai'
import {
  type CallToolResult,
  McpClient,
  StdioTransport,
  toLlmContent,
} from '@earendil-works/pi-mcp'

import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { sanitizeAiAgentToolErrorMessage } from '#ai/core/ai_agent_tool_errors'
import type { AiAgentMcpToolConfiguration } from '#models/ai_agent_configuration'
import {
  type AiAgentMcpProcessConfiguration,
  type AiAgentMcpServer,
  assertAiAgentMcpConfiguration,
  decryptAiAgentMcpEnvironment,
  getAiAgentMcpServer,
} from '#services/ai_agent_mcp_configuration_service'
import { recordAuditEvent } from '#services/audit_log'
export type AiAgentMcpToolInfo = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  readOnlyHint: boolean
}

export type AiAgentMcpResultSummary = {
  contentTypes: string[]
  textCharacters: number
  structuredType?: 'array' | 'object' | 'string' | 'number' | 'boolean' | 'null'
  structuredCount?: number
}

export function summarizeAiAgentMcpResult(result: CallToolResult): AiAgentMcpResultSummary {
  const contentTypes = [...new Set(result.content.map(({ type }) => type))].slice(0, 8)
  const textCharacters = result.content.reduce(
    (total, block) => total + (block.type === 'text' ? block.text.length : 0),
    0
  )
  const structured = result.structuredContent
  if (structured === undefined) return { contentTypes, textCharacters }
  if (Array.isArray(structured)) {
    return {
      contentTypes,
      textCharacters,
      structuredType: 'array',
      structuredCount: structured.length,
    }
  }
  if (structured === null) return { contentTypes, textCharacters, structuredType: 'null' }
  if (typeof structured === 'object') {
    return {
      contentTypes,
      textCharacters,
      structuredType: 'object',
      structuredCount: Object.keys(structured).length,
    }
  }
  if (typeof structured === 'string') {
    return { contentTypes, textCharacters, structuredType: 'string' }
  }
  if (typeof structured === 'number') {
    return { contentTypes, textCharacters, structuredType: 'number' }
  }
  if (typeof structured === 'boolean') {
    return { contentTypes, textCharacters, structuredType: 'boolean' }
  }
  return { contentTypes, textCharacters }
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
  const readableName = toolName.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32)
  const suffix = createHash('sha256').update(`${serverId}:${toolName}`).digest('hex').slice(0, 16)
  return `mcp_${mode}_${readableName}_${suffix}`
}

export async function createConfiguredMcpAgentTools(
  servers: AiAgentMcpServer[],
  context: AiAgentToolContext
): Promise<AgentTool[]> {
  const tools: AgentTool[] = []
  for (const [serverIndex, server] of servers.entries()) {
    if (!server.enabled || !Object.keys(server.enabledTools ?? {}).length) continue
    let discoveredTools: AiAgentMcpToolInfo[]
    const startedAt = Date.now()
    const discoveryStatus = {
      callId: `d${serverIndex}`,
      serverName: server.name,
      startedAt,
    }
    await context.onMcpDiscovery?.({ ...discoveryStatus, state: 'running' })
    try {
      discoveredTools = await discoverAiAgentMcpServerTools(server)
      await context.onMcpDiscovery?.({
        ...discoveryStatus,
        state: 'done',
        durationMs: Date.now() - startedAt,
        toolCount: discoveredTools.length,
        tools: discoveredTools.slice(0, 20).map(({ name }) => ({
          name: name.slice(0, 128),
          ...(server.enabledTools?.[name]?.mode ? { mode: server.enabledTools[name]!.mode } : {}),
        })),
      })
    } catch (error) {
      await context.onMcpDiscovery?.({
        ...discoveryStatus,
        state: 'error',
        durationMs: Date.now() - startedAt,
      })
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
              : {
                  kind: 'mcp_tool_result',
                  serverId: server.id,
                  toolName: tool.name,
                  resultSummary: summarizeAiAgentMcpResult(result),
                }
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
