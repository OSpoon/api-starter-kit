import vine from '@vinejs/vine'

export const bindChannelIdentityValidator = vine.compile(
  vine.object({
    code: vine.string().trim().minLength(8).maxLength(8),
  })
)
