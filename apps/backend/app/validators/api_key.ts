import vine from '@vinejs/vine'

export const apiKeyListValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).max(Number.MAX_SAFE_INTEGER).decimal(0).optional(),
    limit: vine.number().min(1).max(Number.MAX_SAFE_INTEGER).decimal(0).optional(),
    name: vine.string().trim().maxLength(120).optional(),
    prefix: vine.string().trim().maxLength(32).optional(),
  })
)

export const apiKeyValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(120),
    expiresAt: vine.string().optional().nullable(),
    expiresIn: vine.enum(['30d', '90d', '180d', 'long']).optional(),
  })
)

export const updateApiKeyValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(120),
    expiresAt: vine.string().optional().nullable(),
    expiresIn: vine.enum(['30d', '90d', '180d', 'long']).optional(),
  })
)
