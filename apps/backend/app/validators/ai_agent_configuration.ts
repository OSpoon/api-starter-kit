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
