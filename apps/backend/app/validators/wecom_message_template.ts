import vine from '@vinejs/vine'

const messageTypes = ['text', 'markdown', 'markdown_v2'] as const

const parameterValidator = vine.object({
  name: vine
    .string()
    .trim()
    .regex(/^[a-zA-Z][\w.-]{0,63}$/),
  type: vine.enum(['string', 'number', 'boolean'] as const),
  required: vine.boolean(),
  description: vine.string().trim().maxLength(200).optional().nullable(),
  maxBytes: vine.number().min(1).max(1_000_000).optional().nullable(),
})

export const createWecomMessageTemplateValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(120),
    description: vine.string().trim().maxLength(500).optional().nullable(),
    msgtype: vine.enum(messageTypes),
    webhookUrl: vine.string().trim().url(),
    payload: vine.record(vine.any()),
    parameters: vine.array(parameterValidator).maxLength(100).optional(),
    enabled: vine.boolean().optional(),
  })
)

export const updateWecomMessageTemplateValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(120),
    description: vine.string().trim().maxLength(500).optional().nullable(),
    msgtype: vine.enum(messageTypes),
    webhookUrl: vine.string().trim().url().optional(),
    payload: vine.record(vine.any()),
    parameters: vine.array(parameterValidator).maxLength(100).optional(),
    enabled: vine.boolean().optional(),
  })
)

export const wecomTemplateParamsValidator = vine.compile(
  vine.object({
    params: vine.record(vine.string().trim()).optional(),
    mentioned_list: vine.array(vine.string().trim()).maxLength(100).optional(),
    mentioned_mobile_list: vine.array(vine.string().trim()).maxLength(100).optional(),
  })
)

export const wecomTemplateDraftTestValidator = vine.compile(
  vine.object({
    msgtype: vine.enum(messageTypes),
    payload: vine.record(vine.any()),
    parameters: vine.array(parameterValidator).maxLength(100).optional(),
    params: vine.record(vine.string().trim()).optional(),
    mentioned_list: vine.array(vine.string().trim()).maxLength(100).optional(),
    mentioned_mobile_list: vine.array(vine.string().trim()).maxLength(100).optional(),
  })
)
