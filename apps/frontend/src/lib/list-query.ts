export function buildListQuery(
  page: number,
  search = '',
  extra: Record<string, string> = {},
  limit = 20
) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit), ...extra })
  const normalizedSearch = search.trim()
  if (normalizedSearch) query.set('search', normalizedSearch)
  return query.toString()
}
