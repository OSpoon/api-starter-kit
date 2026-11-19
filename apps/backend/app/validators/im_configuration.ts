import vine from '@vinejs/vine'

const channel = vine.enum(['wecom', 'feishu', 'dingtalk'] as const)
const channels = vine
  .string()
  .trim()
  .maxLength(32)
  .regex(/^(?:wecom|feishu|dingtalk)(?:,(?:wecom|feishu|dingtalk))*$/)
const optionalString = (maxLength: number) =>
  vine.string().trim().maxLength(maxLength).optional().nullable()

export const listImBotsValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).max(Number.MAX_SAFE_INTEGER).decimal(0).optional(),
    limit: vine.number().min(1).max(100).decimal(0).optional(),
    search: vine.string().trim().maxLength(200).optional(),
    channels: channels.optional(),
  })
)

export const createImBotValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(160),
    channel,
    identifier: vine.string().trim().minLength(1).maxLength(160),
    secret: vine.string().trim().minLength(1).maxLength(500),
    tenantId: optionalString(160),
    endpoint: optionalString(500),
    cardTemplateId: optionalString(200),
    streamingCardTemplateId: optionalString(200),
    enabled: vine.boolean().optional(),
  })
)

export const updateImBotValidator = vine.compile(
  vine.object({
    name: vine.string().trim().maxLength(160).optional(),
    identifier: vine.string().trim().maxLength(160).optional().nullable(),
    secret: vine.string().trim().maxLength(500).optional().nullable(),
    tenantId: optionalString(160),
    endpoint: optionalString(500),
    cardTemplateId: optionalString(200),
    streamingCardTemplateId: optionalString(200),
    enabled: vine.boolean().optional(),
  })
)

export const imBotIdValidator = vine.compile(vine.object({ id: vine.string().regex(/^[1-9]\d*$/) }))
