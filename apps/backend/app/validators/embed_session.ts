import vine from '@vinejs/vine'

export const embedSessionValidator = vine.compile(
  vine.object({
    sessionId: vine.string().uuid(),
  })
)
