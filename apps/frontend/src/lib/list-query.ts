export function buildListQuery(page: number, filters: Record<string, string> = {}, limit = 20) {
  return new URLSearchParams({ page: String(page), limit: String(limit), ...filters }).toString()
}
