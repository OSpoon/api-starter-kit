import { z } from 'zod'

export const queryPageSize = 20

export const queryPageParameter = {
  description:
    'Optional 1-based page number; omit for page 1. Retrieve each following page through the final page when all records are requested.',
  schema: z.preprocess(
    (value) => (value === null || value === '' ? undefined : value),
    z.coerce.number().int().min(1).default(1)
  ),
}

export function queryPageMessage(meta: { currentPage: number; lastPage: number; total: number }) {
  if (meta.lastPage <= 1) return undefined
  return `Page ${meta.currentPage} of ${meta.lastPage} (${meta.total} results). ${meta.currentPage < meta.lastPage ? `Request page=${meta.currentPage + 1} to continue.` : 'This is the final page.'}`
}
