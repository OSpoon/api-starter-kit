import vine from '@vinejs/vine'

export const uploadMediaImageValidator = vine.compile(
  vine.object({ image: vine.file({ size: '2mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] }) })
)

export const mediaImageFileNameValidator = vine.compile(
  vine.object({
    fileName: vine.string().regex(/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\.(?:jpg|png|webp)$/i),
  })
)
