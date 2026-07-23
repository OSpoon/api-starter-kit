import vine from '@vinejs/vine'

export const knowledgeDocumentValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(200),
    content: vine.string().trim().minLength(1).maxLength(200_000),
    requiredPermission: vine.string().trim().maxLength(100).optional().nullable(),
    status: vine.enum(['draft', 'published'] as const),
  })
)
