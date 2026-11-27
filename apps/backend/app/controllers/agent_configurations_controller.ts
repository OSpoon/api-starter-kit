import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'

import type { HttpContext } from '@adonisjs/core/http'
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@foadonis/openapi/decorators'

import {
  getAiAgentToolSettings,
  updateAiAgentToolSettings,
} from '#services/ai_agent_configuration_service'
import {
  getAiAgentMcpConfiguration,
  getAiAgentMcpServer,
  listAiAgentMcpServers,
  replaceAiAgentMcpConfiguration,
  serializeAiAgentMcpServer,
  updateAiAgentMcpServer,
} from '#services/ai_agent_mcp_configuration_service'
import { discoverAiAgentMcpServerTools } from '#services/ai_agent_mcp_service'
import {
  installAiAgentSkills,
  installAiAgentSkillZip,
  listAiAgentSkills,
  removeAiAgentSkill,
  updateAiAgentSkill,
  validateAiAgentSkillSource,
} from '#services/ai_agent_skill_service'
import { AiAgentSkillZipError } from '#services/ai_agent_skill_zip'
import { recordAuditEvent } from '#services/audit_log'
import {
  getMineruConfigurationStatus,
  MineruTokenRequiredError,
  updateMineruToken,
} from '#services/mineru_configuration_service'
import { clampLimit } from '#support/pagination'
import {
  aiAgentMcpServerIdValidator,
  aiAgentSkillCodeValidator,
  installAiAgentSkillsValidator,
  installAiAgentSkillZipValidator,
  updateAiAgentConfigurationValidator,
  updateAiAgentMcpConfigurationValidator,
  updateAiAgentMcpServerValidator,
  updateAiAgentSkillValidator,
  updateMineruTokenValidator,
} from '#validators/ai_agent_configuration'
import { paginationSearchQueryValidator } from '#validators/pagination'

import {
  type ApiSchema,
  dataEnvelope,
  errorResponseSchema,
  paginatedDataEnvelope,
} from '../openapi/response_schemas.js'

const toolSettingSchema: ApiSchema = {
  type: 'object',
  required: ['code', 'enabled', 'mode', 'modeConfigurable', 'requiresConfirmation'],
  properties: {
    code: { type: 'string' },
    enabled: { type: 'boolean' },
    mode: { type: 'string', enum: ['direct', 'confirm'] },
    modeConfigurable: { type: 'boolean' },
    requiresConfirmation: { type: 'boolean' },
  },
}

const mineruStatusSchema: ApiSchema = {
  type: 'object',
  required: ['source', 'maskedToken'],
  properties: {
    source: { type: 'string', nullable: true, enum: ['web'] },
    maskedToken: { type: 'string', nullable: true },
  },
}

const skillSchema: ApiSchema = {
  type: 'object',
  required: ['code', 'name', 'description', 'enabled', 'updatedAt'],
  properties: {
    code: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    enabled: { type: 'boolean' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}

const mcpServerSchema: ApiSchema = {
  type: 'object',
  required: [
    'id',
    'name',
    'type',
    'command',
    'args',
    'cwd',
    'url',
    'enabled',
    'environmentConfigured',
    'headersConfigured',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string', enum: ['stdio', 'http'] },
    command: { type: 'string', nullable: true },
    args: { type: 'array', items: { type: 'string' } },
    cwd: { type: 'string', nullable: true },
    url: { type: 'string', nullable: true },
    enabled: { type: 'boolean' },
    environmentConfigured: { type: 'boolean' },
    headersConfigured: { type: 'boolean' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}

const configurationResponseSchema: ApiSchema = {
  type: 'object',
  required: ['tools', 'mineru'],
  properties: {
    tools: { type: 'array', items: toolSettingSchema },
    mineru: mineruStatusSchema,
  },
}

@ApiSecurity('bearerAuth')
export default class AgentConfigurationsController {
  @ApiOperation({ summary: '获取 Agent 工具配置目录' })
  @ApiResponse({
    status: 200,
    description: '内置 Agent 工具的启用状态、执行策略及脱敏后的 MinerU Token',
    schema: dataEnvelope(configurationResponseSchema),
  })
  async show({ serialize }: HttpContext) {
    return serialize({
      tools: await getAiAgentToolSettings(),
      mineru: await getMineruConfigurationStatus(),
    })
  }

  @ApiOperation({ summary: '更新 Agent 内置工具配置' })
  @ApiBody({ type: () => updateAiAgentConfigurationValidator, required: true })
  @ApiResponse({
    status: 200,
    description: '已更新 Agent 工具配置',
    schema: dataEnvelope(configurationResponseSchema),
  })
  @ApiResponse({ status: 422, description: '工具配置无效', schema: errorResponseSchema })
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
    return ctx.serialize({
      tools: await getAiAgentToolSettings(),
      mineru: await getMineruConfigurationStatus(),
    })
  }

  @ApiOperation({ summary: '保存或清除 MinerU API Token' })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      anyOf: [{ required: ['token'] }, { required: ['enable'] }],
      properties: {
        token: { type: 'string', nullable: true, writeOnly: true, minLength: 1, maxLength: 1024 },
        enable: { type: 'boolean', description: '保存 Token 时启用 PDF 读取工具' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '返回工具配置列表和脱敏后的 MinerU Token',
    schema: dataEnvelope(configurationResponseSchema),
  })
  @ApiResponse({ status: 422, description: 'Token 或启用参数无效', schema: errorResponseSchema })
  async updateMineruConfiguration(ctx: HttpContext) {
    const { token, enable } = await ctx.request.validateUsing(updateMineruTokenValidator)
    if ((token === undefined && !enable) || (token === null && enable)) {
      return ctx.response.unprocessableEntity({ message: '请提供 Token 或确认启用现有配置' })
    }
    try {
      await updateMineruToken(token, enable)
    } catch (error) {
      if (error instanceof MineruTokenRequiredError) {
        return ctx.response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.mineru_configuration_updated',
      targetType: 'ai_agent_configuration',
      targetId: 1,
      metadata: {
        operation: token === undefined ? 'enable' : token === null ? 'clear' : 'save',
        ...(enable ? { enabled: true } : {}),
      },
    })
    return ctx.serialize({
      tools: await getAiAgentToolSettings(),
      mineru: await getMineruConfigurationStatus(),
    })
  }

  @ApiOperation({ summary: '获取已安装的 Agent 技能' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiResponse({
    status: 200,
    description: '分页返回已安装技能的名称、说明和启用状态',
    schema: paginatedDataEnvelope(skillSchema),
  })
  async skills({ request, serialize }: HttpContext) {
    const pagination = await paginationSearchQueryValidator.validate(request.qs())
    const result = await listAiAgentSkills(
      pagination.page ?? 1,
      clampLimit(pagination.limit, 20, 100)
    )
    return serialize({ items: result.items, meta: result.meta })
  }

  @ApiOperation({ summary: '通过 skills CLI 安装 Agent 技能' })
  @ApiBody({ type: () => installAiAgentSkillsValidator, required: true })
  @ApiResponse({
    status: 200,
    description: '本次新增的技能名称',
    schema: dataEnvelope({
      type: 'object',
      required: ['installed'],
      properties: { installed: { type: 'array', items: { type: 'string' } } },
    }),
  })
  @ApiResponse({ status: 422, description: '来源地址无效', schema: errorResponseSchema })
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

  @ApiOperation({ summary: '从上传的 ZIP 安装单个 Agent 技能' })
  @ApiBody({
    mediaType: 'multipart/form-data',
    required: true,
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 200,
    description: '安装后默认停用的技能名称',
    schema: dataEnvelope({
      type: 'object',
      required: ['installed'],
      properties: { installed: { type: 'array', items: { type: 'string' } } },
    }),
  })
  @ApiResponse({ status: 409, description: '技能代码已存在', schema: errorResponseSchema })
  @ApiResponse({ status: 422, description: 'ZIP 或技能包无效', schema: errorResponseSchema })
  async installSkillZip(ctx: HttpContext) {
    if (!ctx.request.is(['multipart/form-data'])) {
      return ctx.response.unprocessableEntity({ message: '请上传 ZIP 文件' })
    }
    const temporary = await mkdtemp(join(tmpdir(), 'agent-skill-upload-'))
    try {
      ctx.request.multipart.onFile('file', { deferValidations: true }, async (part, report) => {
        const tmpPath = join(temporary, randomUUID())
        part.pause()
        part.on('data', report)
        await pipeline(part, createWriteStream(tmpPath, { flags: 'wx', mode: 0o600 }))
        return { tmpPath }
      })
      await ctx.request.multipart.process()
      const { file } = await ctx.request.validateUsing(installAiAgentSkillZipValidator)
      if (!file.tmpPath) throw new AiAgentSkillZipError('ZIP 文件无效')
      const installed = await installAiAgentSkillZip(file.tmpPath)
      await recordAuditEvent(ctx, {
        actorUserId: ctx.auth.getUserOrFail().id,
        action: 'agent.skills_installed',
        targetType: 'ai_agent_skills',
        metadata: { installedCount: installed.length, source: 'zip' },
      })
      return ctx.serialize({ installed })
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }

  @ApiOperation({ summary: '更新 Agent 技能的启用状态' })
  @ApiBody({ type: () => updateAiAgentSkillValidator, required: true })
  @ApiResponse({ status: 200, description: '更新后的技能', schema: dataEnvelope(skillSchema) })
  @ApiResponse({ status: 404, description: '技能不存在', schema: errorResponseSchema })
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

  @ApiOperation({ summary: '移除 Agent 技能' })
  @ApiResponse({
    status: 200,
    description: 'Agent 技能已移除',
    schema: dataEnvelope({
      type: 'object',
      required: ['code', 'removed'],
      properties: { code: { type: 'string' }, removed: { type: 'boolean', enum: [true] } },
    }),
  })
  @ApiResponse({ status: 404, description: '技能不存在', schema: errorResponseSchema })
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

  @ApiOperation({ summary: '分页获取已配置的 MCP 服务' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiResponse({
    status: 200,
    description: '返回服务配置元数据，不包含环境变量值',
    schema: paginatedDataEnvelope(mcpServerSchema),
  })
  async mcpServers({ request, serialize }: HttpContext) {
    const pagination = await paginationSearchQueryValidator.validate(request.qs())
    const result = await listAiAgentMcpServers(
      pagination.page ?? 1,
      clampLimit(pagination.limit, 20, 100)
    )
    return serialize({ items: result.items, meta: result.meta })
  }

  @ApiOperation({ summary: '获取共享 MCP 服务配置' })
  @ApiResponse({
    status: 200,
    description: '返回 stdio 或 Streamable HTTP 配置；不包含环境变量或请求头值',
    schema: dataEnvelope({
      type: 'object',
      required: ['mcpServers'],
      properties: {
        mcpServers: {
          type: 'object',
          additionalProperties: {
            oneOf: [
              {
                type: 'object',
                required: ['type', 'command', 'args', 'cwd'],
                properties: {
                  type: { type: 'string', enum: ['stdio'] },
                  command: { type: 'string' },
                  args: { type: 'array', items: { type: 'string' } },
                  cwd: { type: 'string', nullable: true },
                  inheritEnv: { type: 'boolean' },
                  stderr: { type: 'string', enum: ['pipe', 'inherit'] },
                  maxMessageBytes: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 67_108_864,
                  },
                  maxStderrBytes: { type: 'integer', minimum: 1, maximum: 1_048_576 },
                  closeTimeoutMs: { type: 'integer', minimum: 0, maximum: 60_000 },
                },
              },
              {
                type: 'object',
                required: ['type', 'url'],
                properties: {
                  type: { type: 'string', enum: ['http'] },
                  url: { type: 'string', format: 'uri', maxLength: 2048 },
                  openGetStream: { type: 'boolean' },
                  maxMessageBytes: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 67_108_864,
                  },
                  reconnect: {
                    type: 'object',
                    properties: {
                      initialDelayMs: { type: 'integer', minimum: 0, maximum: 30_000 },
                      maxDelayMs: { type: 'integer', minimum: 0, maximum: 120_000 },
                      maxRetries: { type: 'integer', minimum: 0, maximum: 20 },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    }),
  })
  async mcpConfiguration({ serialize }: HttpContext) {
    return serialize(await getAiAgentMcpConfiguration())
  }

  @ApiOperation({
    summary: '替换共享 MCP 服务配置',
    description:
      '支持 pi-mcp 的 stdio 与 Streamable HTTP 传输选项。env 与 headers 会加密保存且不会回显；省略时保留已保存的对应密钥，传空对象时清除。',
  })
  @ApiBody({ type: () => updateAiAgentMcpConfigurationValidator, required: true })
  @ApiResponse({
    status: 200,
    description: '已保存的 MCP 服务列表',
    schema: dataEnvelope({
      type: 'object',
      required: ['items'],
      properties: { items: { type: 'array', items: mcpServerSchema } },
    }),
  })
  @ApiResponse({
    status: 422,
    description: '传输类型、命令、参数、URL、环境变量或请求头无效',
    schema: errorResponseSchema,
  })
  async updateMcpConfiguration(ctx: HttpContext) {
    const payload = await updateAiAgentMcpConfigurationValidator.validate(ctx.request.body())
    const entries = Object.fromEntries(
      Object.entries(payload.mcpServers).map(([name, server]) => [
        name,
        server.type === 'http'
          ? {
              type: 'http' as const,
              url: server.url,
              headers: server.headers,
              openGetStream: server.openGetStream,
              maxMessageBytes: server.maxMessageBytes,
              reconnect: server.reconnect,
            }
          : {
              type: 'stdio' as const,
              command: server.command,
              args: server.args ?? [],
              cwd: server.cwd,
              environment: server.env,
              inheritEnv: server.inheritEnv,
              stderr: server.stderr,
              maxMessageBytes: server.maxMessageBytes,
              maxStderrBytes: server.maxStderrBytes,
              closeTimeoutMs: server.closeTimeoutMs,
            },
      ])
    )
    const items = await replaceAiAgentMcpConfiguration(entries)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.mcp_configuration_updated',
      targetType: 'ai_agent_configuration',
      targetId: 1,
      metadata: { serverCount: items.length },
    })
    return ctx.serialize({ items })
  }

  @ApiOperation({ summary: '启用或停用 MCP 服务及其全部工具' })
  @ApiBody({ type: () => updateAiAgentMcpServerValidator, required: true })
  @ApiResponse({
    status: 200,
    description: '更新后的 MCP 服务状态',
    schema: dataEnvelope(mcpServerSchema),
  })
  @ApiResponse({ status: 404, description: 'MCP 服务不存在', schema: errorResponseSchema })
  async updateMcpServer(ctx: HttpContext) {
    const payload = await updateAiAgentMcpServerValidator.validate(ctx.request.body())
    const { id } = await aiAgentMcpServerIdValidator.validate({ id: ctx.request.param('id') })
    const server = await updateAiAgentMcpServer(id, payload)
    await recordAuditEvent(ctx, {
      actorUserId: ctx.auth.getUserOrFail().id,
      action: 'agent.mcp_server_enabled_state_updated',
      targetType: 'mcp_server',
      targetId: server.id,
      metadata: { enabled: server.enabled },
    })
    return ctx.serialize(server)
  }

  @ApiOperation({ summary: '启动 MCP 服务并读取其工具目录' })
  @ApiResponse({
    status: 200,
    description: 'MCP 工具名称、说明、参数 schema 和只读声明',
    schema: dataEnvelope({
      type: 'object',
      required: ['tools', 'server'],
      properties: {
        tools: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'description', 'inputSchema', 'readOnlyHint'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              inputSchema: { type: 'object', additionalProperties: true },
              readOnlyHint: { type: 'boolean' },
            },
          },
        },
        server: mcpServerSchema,
      },
    }),
  })
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
