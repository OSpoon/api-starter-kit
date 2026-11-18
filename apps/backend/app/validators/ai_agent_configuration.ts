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
