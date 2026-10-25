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

const skillFields = {
  code: vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: vine.string().trim().minLength(1).maxLength(128),
  description: vine.string().trim().minLength(1).maxLength(1024),
  instructions: vine.string().trim().minLength(1).maxLength(50_000),
  enabled: vine.boolean(),
}

export const createAiAgentSkillValidator = vine.compile(vine.object(skillFields))

export const updateAiAgentSkillValidator = vine.compile(
  vine.object({
    code: skillFields.code.optional(),
    name: skillFields.name.optional(),
    description: skillFields.description.optional(),
    instructions: skillFields.instructions.optional(),
    enabled: skillFields.enabled.optional(),
  })
)

const enabledMcpTools = vine.record(
  vine.object({
    mode: vine.enum(['read', 'confirm'] as const),
  })
)

const mcpFields = {
  name: vine.string().trim().minLength(1).maxLength(128),
  command: vine
    .string()
    .trim()
    .minLength(2)
    .maxLength(2000)
    .regex(/^\/.+$/),
  args: vine
    .array(
      vine
        .string()
        .maxLength(4000)
        .regex(/^[^\0]*$/)
    )
    .maxLength(100),
  cwd: vine
    .string()
    .trim()
    .maxLength(2000)
    .regex(/^\/.*$/)
    .optional()
    .nullable(),
  environment: vine
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

export const createAiAgentMcpServerValidator = vine.compile(
  vine.object({
    ...mcpFields,
    enabled: vine.boolean(),
    enabledTools: enabledMcpTools,
  })
)

export const updateAiAgentMcpServerValidator = vine.compile(
  vine.object({
    name: mcpFields.name.optional(),
    command: mcpFields.command.optional(),
    args: mcpFields.args.optional(),
    cwd: mcpFields.cwd,
    environment: mcpFields.environment,
    enabled: vine.boolean().optional(),
    enabledTools: enabledMcpTools.optional(),
  })
)

export const testAiAgentMcpConnectionValidator = vine.compile(
  vine.object({
    serverId: vine.number().withoutDecimals().positive().optional(),
    command: mcpFields.command,
    args: mcpFields.args,
    cwd: mcpFields.cwd,
    environment: mcpFields.environment,
  })
)

export const aiAgentModuleIdValidator = vine.compile(
  vine.object({
    id: vine
      .string()
      .trim()
      .maxLength(16)
      .regex(/^[1-9]\d*$/),
  })
)
