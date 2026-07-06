import { apiRequest } from '@/lib/api'
import { readItem, readList } from '@/lib/api-types'

export interface ApiKeySummary {
  id: number
  name: string
  prefix: string
  key?: string
  lastUsedAt?: string | null
  expiresAt?: string | null
  revokedAt?: string | null
  createdAt: string
  deleted?: boolean
}

export type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'muted'

const badgeToneClasses: Record<BadgeTone, string> = {
  success: 'border-chart-3/30 bg-chart-3/10 text-chart-3',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
  warning: 'border-chart-4/30 bg-chart-4/10 text-chart-4',
  info: 'border-accent/30 bg-accent/10 text-accent',
  muted: 'border-muted-foreground/20 text-muted-foreground',
}

export function badgeToneClass(tone: BadgeTone) {
  return badgeToneClasses[tone]
}

function authOptions(token: string | null) {
  return { token }
}

export async function listApiKeys(token: string | null) {
  const response = await apiRequest<ApiKeySummary[]>('/api/v1/api-keys', authOptions(token))
  return readList(response)
}

export async function createApiKey(
  token: string | null,
  payload: { name: string; expiresIn: string }
) {
  const response = await apiRequest<ApiKeySummary>('/api/v1/api-keys', {
    ...authOptions(token),
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return readItem(response)
}

export async function revokeApiKey(token: string | null, id: number) {
  const response = await apiRequest<ApiKeySummary>(`/api/v1/api-keys/${id}`, {
    ...authOptions(token),
    method: 'DELETE',
  })
  return readItem(response)
}
