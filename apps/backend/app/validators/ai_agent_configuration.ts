import vine from '@vinejs/vine'

import { builtInAiAgentToolNames } from '#ai/core/ai_agent_tool_catalog'

export const updateAiAgentConfigurationValidator = vine.compile(
  vine.object({
    tools: vine
      .array(
        vine.object({
          code: vine.enum(builtInAiAgentToolNames),
          enabled: vine.boolean(),
          mode: vine.enum(['direct', 'confirm'] as const),
        })
      )
      .minLength(builtInAiAgentToolNames.length)
      .maxLength(builtInAiAgentToolNames.length),
  })
)

const enabledMcpTools = vine.record(
  vine.object({
    mode: vine.enum(['read', 'confirm'] as const),
  })
)

const mcpFields = {
  command: vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(2000)
    .regex(/^(?:\/.+|[A-Za-z0-9][A-Za-z0-9._+-]*)$/),
  args: vine
    .array(
      vine
        .string()
        .maxLength(4000)
        .regex(/^[^\0]*$/)
    )
    .maxLength(100)
    .optional(),
  cwd: vine
    .string()
    .trim()
    .maxLength(2000)
    .regex(/^\/.*$/)
    .optional()
    .nullable(),
  env: vine
    .record(
      vine
        .string()
        .maxLength(4000)
        .regex(/^[^\0]*$/)
    )
    .maxLength(20)
    .validateKeys((keys, field) => {
      if (!keys.every((key) => /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key))) {
        field.report('MCP 环境变量名称无效', 'invalidEnvironmentKeys', field)
      }
    })
    .optional(),
}

const mcpServerConfiguration = vine.object(mcpFields)

export const updateAiAgentMcpConfigurationValidator = vine.compile(
  vine.object({
    mcpServers: vine
      .record(mcpServerConfiguration)
      .maxLength(100)
      .validateKeys((keys, field) => {
        if (!keys.every((key) => key.trim().length > 0 && !/[\\/\0]/.test(key))) {
          field.report('MCP 服务名称无效', 'invalidServerNames', field)
        }
      }),
  })
)

export const updateAiAgentMcpServerValidator = vine.compile(
  vine.object({
    enabled: vine.boolean().optional(),
    enabledTools: enabledMcpTools.optional(),
  })
)

export const testAiAgentMcpConnectionValidator = vine.compile(
  vine.object({
    serverId: vine.string().trim().minLength(1).maxLength(64).optional(),
    command: mcpFields.command,
    args: mcpFields.args,
    cwd: mcpFields.cwd,
    env: mcpFields.env,
  })
)

export const aiAgentMcpServerIdValidator = vine.compile(
  vine.object({
    id: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(64)
      .regex(/^[^/\\\0]+$/),
  })
)
