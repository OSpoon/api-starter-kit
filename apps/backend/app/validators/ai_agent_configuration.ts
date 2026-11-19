import '@adonisjs/core/providers/vinejs_provider'

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
      .minLength(builtInAiAgentToolNames.length - 1)
      .maxLength(builtInAiAgentToolNames.length),
  })
)

const mcpServerConfiguration = vine.object({
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
    .maxLength(100)
    .validateKeys((keys, field) => {
      if (!keys.every((key) => /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key))) {
        field.report('MCP 环境变量名称无效', 'invalidEnvironmentKeys', field)
      }
    })
    .optional(),
})

export const updateAiAgentMcpConfigurationValidator = vine.compile(
  vine.object({
    mcpServers: vine
      .record(mcpServerConfiguration)
      .maxLength(100)
      .validateKeys((keys, field) => {
        if (
          !keys.every((key) => key.trim().length > 0 && key.length <= 128 && !/[\\/\0]/.test(key))
        ) {
          field.report('MCP 服务名称无效', 'invalidServerNames', field)
        }
      }),
  })
)

export const updateAiAgentMcpServerValidator = vine.compile(
  vine.object({ enabled: vine.boolean() })
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

export const updateMineruTokenValidator = vine.compile(
  vine.object({
    token: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(1024)
      .regex(/^[!-~]+$/)
      .nullable()
      .optional(),
    enable: vine.boolean().optional(),
  })
)

export const installAiAgentSkillsValidator = vine.compile(
  vine.object({
    source: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(2048)
      .regex(
        /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_-][A-Za-z0-9_.-]*(?:@[A-Za-z0-9._/-]+)?|git@[A-Za-z0-9.-]+:[^\s]+\.git|https:\/\/\S+|ssh:\/\/(?:git@)?\S+\.git)$/i
      ),
  })
)

export const installAiAgentSkillZipValidator = vine.compile(
  vine.object({ file: vine.file({ size: '10mb', extnames: ['zip'] }) })
)

export const updateAiAgentSkillValidator = vine.compile(vine.object({ enabled: vine.boolean() }))

export const aiAgentSkillCodeValidator = vine.compile(
  vine.object({
    code: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(128)
      .regex(/^(?!\.{1,2}$)[^/\\\0]+$/),
  })
)
