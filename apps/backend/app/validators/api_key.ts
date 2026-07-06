import vine from '@vinejs/vine'

export const apiKeyValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(120),
    expiresAt: vine.string().optional().nullable(),
    expiresIn: vine.enum(['30d', '90d', '180d', 'long']).optional(),
  })
)
