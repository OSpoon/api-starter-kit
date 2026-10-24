export const queryBatchSize = 100

type QueryPage<T> = {
  all(): T[]
  getMeta(): { lastPage: number }
}

export async function fetchAllQueryPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<QueryPage<T>>
) {
  const rows: T[] = []
  let page = 1
  while (true) {
    const result = await fetchPage(page, queryBatchSize)
    rows.push(...result.all())
    if (page >= result.getMeta().lastPage) return rows
    page += 1
  }
}

export function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!domain) return '[redacted]'
  return `${local.slice(0, 1)}***@${domain}`
}

export function maskName(name: string) {
  return name.length <= 1 ? '*' : `${name.slice(0, 1)}*`
}
