import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import {
  getAiAgentToolSettings,
  updateAiAgentToolSettings,
} from '#services/ai_agent_configuration_service'
import {
  decryptAiAgentMcpEnvironment,
  getAiAgentMcpConfiguration,
  getAiAgentMcpServer,
  listAiAgentMcpServers,
  replaceAiAgentMcpConfiguration,
  serializeAiAgentMcpServer,
  updateAiAgentMcpServer,
} from '#services/ai_agent_mcp_configuration_service'
import {
  discoverAiAgentMcpServerTools,
  discoverAiAgentMcpTools,
} from '#services/ai_agent_mcp_service'
import { recordAuditEvent } from '#services/audit_log'
import { clampLimit } from '#support/pagination'
import {
  aiAgentMcpServerIdValidator,
  testAiAgentMcpConnectionValidator,
  updateAiAgentConfigurationValidator,
  updateAiAgentMcpConfigurationValidator,
  updateAiAgentMcpServerValidator,
} from '#validators/ai_agent_configuration'
import { paginationSearchQueryValidator } from '#validators/pagination'

@ApiSecurity('bearerAuth')
export default class AgentConfigurationsController {
  @ApiOperation({ summary: '获取 Agent 工具配置目录' })
  @ApiResponse({
    status: 200,
    description: '内置 Agent 工具的启用状态、执行策略及不可关闭的操作确认要求',
  })
  async show({ serialize }: HttpContext) {
    return serialize({ tools: await getAiAgentToolSettings() })
  }

  @ApiOperation({ summary: '更新 Agent 内置工具配置' })
  async updateConfiguration(ctx: HttpContext) {
    const payload = await updateAiAgentConfigurationValidator.validate(ctx.request.body())
    const configuration = await updateAiAgentToolSettings(payload.tools)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.configuration_updated',
      targetType: 'ai_agent_configuration',
      targetId: 1,
      metadata: {
        enabledTools: configuration.enabledTools,
        toolModes: configuration.toolModes,
      },
    })
    return ctx.serialize({ tools: await getAiAgentToolSettings() })
  }

  @ApiOperation({ summary: '获取 MCP 服务配置' })
  async mcpServers({ request, serialize }: HttpContext) {
    const pagination = await paginationSearchQueryValidator.validate(request.qs())
    const page = pagination.page ?? 1
    const limit = clampLimit(pagination.limit, 20, 100)
    const result = await listAiAgentMcpServers(page, limit)
    return serialize({ items: result.items, meta: result.meta })
  }

  @ApiOperation({ summary: '获取共享 MCP 服务配置' })
  async mcpConfiguration({ serialize }: HttpContext) {
    return serialize(await getAiAgentMcpConfiguration())
  }

  @ApiOperation({ summary: '替换共享 MCP 服务配置' })
  async updateMcpConfiguration(ctx: HttpContext) {
    const payload = await updateAiAgentMcpConfigurationValidator.validate(ctx.request.body())
    const servers = Object.fromEntries(
      Object.entries(payload.mcpServers).map(([name, server]) => [
        name,
        {
          command: server.command,
          args: server.args ?? [],
          cwd: server.cwd,
          environment: server.env,
        },
      ])
    )
    const updated = await replaceAiAgentMcpConfiguration(servers)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.mcp_configuration_updated',
      targetType: 'ai_agent_configuration',
      targetId: 1,
      metadata: { serverCount: updated.length },
    })
    return ctx.serialize({ items: updated })
  }

  @ApiOperation({ summary: '更新 MCP 服务启用状态和工具执行策略' })
  async updateMcpServer(ctx: HttpContext) {
    const payload = await updateAiAgentMcpServerValidator.validate(ctx.request.body())
    const { id } = await aiAgentMcpServerIdValidator.validate({ id: ctx.request.param('id') })
    const server = await updateAiAgentMcpServer(id, payload)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.mcp_server_policy_updated',
      targetType: 'mcp_server',
      targetId: server.id,
      metadata: {
        enabled: server.enabled,
        enabledToolCount: Object.keys(server.enabledTools).length,
      },
    })
    return ctx.serialize(server)
  }

  @ApiOperation({ summary: '启动本地 MCP 进程并发现工具' })
  async testMcpConnection(ctx: HttpContext) {
    const payload = await testAiAgentMcpConnectionValidator.validate(ctx.request.body())
    let environment = payload.env
    if (environment === undefined && payload.serverId) {
      const server = await getAiAgentMcpServer(payload.serverId)
      environment = decryptAiAgentMcpEnvironment(server.environment)
    }
    const tools = await discoverAiAgentMcpTools({
      command: payload.command,
      args: payload.args ?? [],
      cwd: payload.cwd,
      environment,
    })
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.mcp_connection_tested',
      targetType: 'mcp_server',
      metadata: { toolCount: tools.length, authorization: 'not_checked' },
    })
    return ctx.serialize({ tools })
  }

  @ApiOperation({ summary: '刷新已配置 MCP 服务的工具目录' })
  async discoverMcpTools(ctx: HttpContext) {
    const { id } = await aiAgentMcpServerIdValidator.validate({ id: ctx.request.param('id') })
    const server = await getAiAgentMcpServer(id)
    const tools = await discoverAiAgentMcpServerTools(server)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.mcp_tools_discovered',
      targetType: 'mcp_server',
      targetId: server.id,
      metadata: { toolCount: tools.length },
    })
    return ctx.serialize({ tools, server: serializeAiAgentMcpServer(server) })
  }
}
