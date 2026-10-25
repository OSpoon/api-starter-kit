import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import {
  getAiAgentToolSettings,
  updateAiAgentToolSettings,
} from '#services/ai_agent_configuration_service'
import {
  decryptAiAgentMcpEnvironment,
  discoverAiAgentMcpServerTools,
  discoverAiAgentMcpTools,
  serializeAiAgentMcpServer,
} from '#services/ai_agent_mcp_service'
import {
  createAiAgentMcpServer,
  createAiAgentSkill,
  deleteAiAgentMcpServer,
  deleteAiAgentSkill,
  getAiAgentMcpServer,
  getAiAgentSkill,
  listAiAgentMcpServers,
  listAiAgentSkills,
  updateAiAgentMcpServer,
  updateAiAgentSkill,
} from '#services/ai_agent_module_service'
import { recordAuditEvent } from '#services/audit_log'
import { clampLimit } from '#support/pagination'
import {
  aiAgentModuleIdValidator,
  createAiAgentMcpServerValidator,
  createAiAgentSkillValidator,
  testAiAgentMcpConnectionValidator,
  updateAiAgentConfigurationValidator,
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

  @ApiOperation({ summary: '获取技能配置' })
  async skills({ request, serialize }: HttpContext) {
    const pagination = await paginationSearchQueryValidator.validate(request.qs())
    const page = pagination.page ?? 1
    const limit = clampLimit(pagination.limit, 20, 100)
    const result = await listAiAgentSkills(page, limit)
    return serialize({
      items: result.items.map((skill) => ({
        id: skill.id,
        code: skill.code,
        name: skill.name,
        description: skill.description,
        enabled: skill.enabled,
        updatedAt: skill.updatedAt.toISO(),
      })),
      meta: result.meta,
    })
  }

  @ApiOperation({ summary: '获取 Agent 技能详情' })
  async showSkill(ctx: HttpContext) {
    const { id } = await aiAgentModuleIdValidator.validate({ id: ctx.request.param('id') })
    const skill = await getAiAgentSkill(Number(id))
    return ctx.serialize({
      id: skill.id,
      code: skill.code,
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      enabled: skill.enabled,
      updatedAt: skill.updatedAt.toISO(),
    })
  }

  @ApiOperation({ summary: '新增 Agent 技能' })
  async createSkill(ctx: HttpContext) {
    const payload = await createAiAgentSkillValidator.validate(ctx.request.body())
    const skill = await createAiAgentSkill(payload)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.skill_created',
      targetType: 'ai_agent_skill',
      targetId: skill.id,
      metadata: { code: skill.code, enabled: skill.enabled },
    })
    return ctx.serialize({
      id: skill.id,
      code: skill.code,
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      enabled: skill.enabled,
      updatedAt: skill.updatedAt.toISO(),
    })
  }

  @ApiOperation({ summary: '更新 Agent 技能' })
  async updateSkill(ctx: HttpContext) {
    const payload = await updateAiAgentSkillValidator.validate(ctx.request.body())
    const { id } = await aiAgentModuleIdValidator.validate({ id: ctx.request.param('id') })
    const skill = await updateAiAgentSkill(Number(id), payload)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.skill_updated',
      targetType: 'ai_agent_skill',
      targetId: skill.id,
      metadata: { code: skill.code, enabled: skill.enabled },
    })
    return ctx.serialize({
      id: skill.id,
      code: skill.code,
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      enabled: skill.enabled,
      updatedAt: skill.updatedAt.toISO(),
    })
  }

  @ApiOperation({ summary: '删除 Agent 技能' })
  async deleteSkill(ctx: HttpContext) {
    const { id: rawId } = await aiAgentModuleIdValidator.validate({ id: ctx.request.param('id') })
    const id = Number(rawId)
    await deleteAiAgentSkill(id)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.skill_deleted',
      targetType: 'ai_agent_skill',
      targetId: id,
    })
    return ctx.response.noContent()
  }

  @ApiOperation({ summary: '获取 MCP 服务配置' })
  async mcpServers({ request, serialize }: HttpContext) {
    const pagination = await paginationSearchQueryValidator.validate(request.qs())
    const page = pagination.page ?? 1
    const limit = clampLimit(pagination.limit, 20, 100)
    const result = await listAiAgentMcpServers(page, limit)
    return serialize({ items: result.items, meta: result.meta })
  }

  @ApiOperation({ summary: '新增本地 stdio MCP 服务' })
  async createMcpServer(ctx: HttpContext) {
    const payload = await createAiAgentMcpServerValidator.validate(ctx.request.body())
    const server = await createAiAgentMcpServer(payload)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.mcp_server_created',
      targetType: 'ai_agent_mcp_server',
      targetId: server.id,
      metadata: {
        enabled: server.enabled,
        enabledToolCount: Object.keys(server.enabledTools).length,
      },
    })
    return ctx.serialize(server)
  }

  @ApiOperation({ summary: '更新本地 stdio MCP 服务' })
  async updateMcpServer(ctx: HttpContext) {
    const payload = await updateAiAgentMcpServerValidator.validate(ctx.request.body())
    const { id } = await aiAgentModuleIdValidator.validate({ id: ctx.request.param('id') })
    const server = await updateAiAgentMcpServer(Number(id), payload)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.mcp_server_updated',
      targetType: 'ai_agent_mcp_server',
      targetId: server.id,
      metadata: {
        enabled: server.enabled,
        enabledToolCount: Object.keys(server.enabledTools).length,
      },
    })
    return ctx.serialize(server)
  }

  @ApiOperation({ summary: '删除本地 stdio MCP 服务' })
  async deleteMcpServer(ctx: HttpContext) {
    const { id: rawId } = await aiAgentModuleIdValidator.validate({ id: ctx.request.param('id') })
    const id = Number(rawId)
    await deleteAiAgentMcpServer(id)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.mcp_server_deleted',
      targetType: 'ai_agent_mcp_server',
      targetId: id,
    })
    return ctx.response.noContent()
  }

  @ApiOperation({ summary: '启动本地 MCP 进程并发现工具' })
  async testMcpConnection(ctx: HttpContext) {
    const payload = await testAiAgentMcpConnectionValidator.validate(ctx.request.body())
    let environment = payload.environment
    if (environment === undefined && payload.serverId) {
      const server = await getAiAgentMcpServer(payload.serverId)
      environment = decryptAiAgentMcpEnvironment(server.environment)
    }
    const tools = await discoverAiAgentMcpTools({ ...payload, environment })
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
    const { id } = await aiAgentModuleIdValidator.validate({ id: ctx.request.param('id') })
    const server = await getAiAgentMcpServer(Number(id))
    const tools = await discoverAiAgentMcpServerTools(server)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.mcp_tools_discovered',
      targetType: 'ai_agent_mcp_server',
      targetId: server.id,
      metadata: { toolCount: tools.length },
    })
    return ctx.serialize({ tools, server: serializeAiAgentMcpServer(server) })
  }
}
