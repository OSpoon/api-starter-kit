import '@adonisjs/core/providers/vinejs_provider'

import vine from '@vinejs/vine'

import { validateAiAutomationCronExpression } from '#services/ai_automation_schedule'

const validCronExpression = vine.createRule((value: unknown, _options, field) => {
  if (typeof value !== 'string') return
  try {
    validateAiAutomationCronExpression(value)
  } catch {
    field.report('CRON 表达式无效或没有下一次执行时间', 'ai_automation.invalid_cron', field)
  }
})

const schedule = vine.object({
  cron: vine.string().trim().minLength(1).maxLength(120).use(validCronExpression()),
})

const automationFields = {
  name: vine.string().trim().minLength(1).maxLength(120),
  prompt: vine.string().trim().minLength(1).maxLength(8_000),
  schedule,
  webhookType: vine.enum(['generic', 'wecom'] as const).optional(),
  webhookUrl: vine.string().trim().minLength(1).maxLength(2_048).optional().nullable(),
}

export const aiAutomationListValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).decimal(0).optional(),
    limit: vine.number().min(1).max(100).decimal(0).optional(),
    name: vine.string().trim().maxLength(120).optional(),
    schedule: vine.string().trim().maxLength(120).optional(),
  })
)

export const aiAutomationValidator = vine.compile(vine.object(automationFields))

export const aiAutomationSchedulePreviewValidator = vine.compile(schedule)

export const aiAutomationEnabledValidator = vine.compile(vine.object({ enabled: vine.boolean() }))

export const aiAutomationUpdateValidator = vine.compile(
  vine.object({ ...automationFields, enabled: vine.boolean() })
)

export const aiAutomationRunListValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).decimal(0).optional(),
    limit: vine.number().min(1).max(50).decimal(0).optional(),
  })
)
