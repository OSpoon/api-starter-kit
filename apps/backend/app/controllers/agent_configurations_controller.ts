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
import {
  installAiAgentSkills,
  listAiAgentSkills,
  removeAiAgentSkill,
  updateAiAgentSkill,
  validateAiAgentSkillSource,
} from '#services/ai_agent_skill_service'
import { recordAuditEvent } from '#services/audit_log'
import { clampLimit } from '#support/pagination'
import {
  aiAgentMcpServerIdValidator,
  aiAgentSkillCodeValidator,
  installAiAgentSkillsValidator,
  testAiAgentMcpConnectionValidator,
  updateAiAgentConfigurationValidator,
  updateAiAgentMcpConfigurationValidator,
  updateAiAgentMcpServerValidator,
  updateAiAgentSkillValidator,
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

  @ApiOperation({ summary: '获取已安装的 Agent 技能' })
  @ApiResponse({ status: 200, description: '分页返回已安装技能的名称、说明和启用状态' })
  async skills({ request, serialize }: HttpContext) {
    const pagination = await paginationSearchQueryValidator.validate(request.qs())
    const result = await listAiAgentSkills(
      pagination.page ?? 1,
      clampLimit(pagination.limit, 20, 100)
    )
    return serialize({ items: result.items, meta: result.meta })
  }

  @ApiOperation({ summary: '通过 skills CLI 安装 Agent 技能' })
  @ApiResponse({ status: 200, description: '返回本次新增的技能名称' })
  @ApiResponse({ status: 422, description: '来源地址无效' })
  async installSkills(ctx: HttpContext) {
    const payload = await installAiAgentSkillsValidator.validate(ctx.request.body())
    try {
      validateAiAgentSkillSource(payload.source)
    } catch (error) {
      return ctx.response.unprocessableEntity({
        message: error instanceof Error ? error.message : '技能来源地址无效',
      })
    }
    const installed = await installAiAgentSkills(payload.source)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.skills_installed',
      targetType: 'ai_agent_skills',
      metadata: { installedCount: installed.length },
    })
    return ctx.serialize({ installed })
  }

  @ApiOperation({ summary: '更新 Agent 技能的启用状态' })
  @ApiResponse({ status: 200, description: '返回更新后的技能' })
  @ApiResponse({ status: 404, description: '技能不存在' })
  async updateSkill(ctx: HttpContext) {
    const payload = await updateAiAgentSkillValidator.validate(ctx.request.body())
    const { code } = await aiAgentSkillCodeValidator.validate({ code: ctx.request.param('code') })
    const skill = await updateAiAgentSkill(code, payload.enabled)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.skill_enabled_state_updated',
      targetType: 'ai_agent_skill',
      targetId: code,
      metadata: { enabled: skill.enabled },
    })
    return ctx.serialize(skill)
  }

  @ApiOperation({ summary: '通过 skills CLI 移除 Agent 技能' })
  @ApiResponse({ status: 200, description: '返回移除结果' })
  @ApiResponse({ status: 404, description: '技能不存在' })
  async removeSkill(ctx: HttpContext) {
    const { code } = await aiAgentSkillCodeValidator.validate({ code: ctx.request.param('code') })
    const skill = await removeAiAgentSkill(code)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.skill_removed',
      targetType: 'ai_agent_skill',
      targetId: code,
      metadata: { enabled: skill.enabled },
    })
    return ctx.serialize({ code, removed: true })
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
