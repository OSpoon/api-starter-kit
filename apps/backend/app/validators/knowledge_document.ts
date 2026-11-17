import vine from '@vinejs/vine'

export const knowledgeDocumentListValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).max(Number.MAX_SAFE_INTEGER).decimal(0).optional(),
    limit: vine.number().min(1).max(Number.MAX_SAFE_INTEGER).decimal(0).optional(),
    title: vine.string().trim().maxLength(200).optional(),
    summary: vine.string().trim().maxLength(2_000).optional(),
    content: vine.string().trim().maxLength(200).optional(),
  })
)

export const knowledgeDocumentValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(200),
    content: vine.string().trim().minLength(1).maxLength(5_000_000),
    summary: vine.string().trim().maxLength(2_000).optional().nullable(),
    topics: vine.array(vine.string().trim().minLength(1).maxLength(80)).maxLength(20).optional(),
    roleIds: vine.array(vine.number().withoutDecimals().positive()).maxLength(100).optional(),
    enabled: vine.boolean().optional(),
  })
)

export const knowledgeDocumentRoleIdsValidator = vine.compile(
  vine.object({
    roleIds: vine.array(vine.number().withoutDecimals().positive()).maxLength(100),
  })
)

export const knowledgeMetadataPreviewValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(200),
    content: vine.string().trim().minLength(1).maxLength(5_000_000),
  })
)
