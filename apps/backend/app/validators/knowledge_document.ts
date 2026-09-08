import vine from '@vinejs/vine'

export const knowledgeDocumentValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(200),
    content: vine.string().trim().minLength(1).maxLength(5_000_000),
    summary: vine.string().trim().maxLength(2_000).optional().nullable(),
    topics: vine.array(vine.string().trim().minLength(1).maxLength(80)).maxLength(20).optional(),
    roleIds: vine.array(vine.number().positive()).optional(),
  })
)

export const knowledgeMetadataPreviewValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(200),
    content: vine.string().trim().minLength(1).maxLength(5_000_000),
  })
)
