import vine from '@vinejs/vine'

export const paginationSearchQueryValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).max(Number.MAX_SAFE_INTEGER).decimal(0).optional(),
    limit: vine.number().min(1).max(Number.MAX_SAFE_INTEGER).decimal(0).optional(),
    search: vine.string().trim().maxLength(200).optional(),
  })
)
