import { apiRequest } from '@/lib/api'
import { readItem } from '@/lib/api-types'

export interface DashboardTrendPoint {
  date: string
  count: number
}

export interface DashboardOverview {
  generatedAt: string
  activeUsers: number | null
  roles: number | null
  activeApiKeys: number | null
  knowledgeDocuments: number | null
  auditEvents: number | null
  aiModelCalls: number | null
  aiTokensUsed: number | null
  auditTrend: DashboardTrendPoint[] | null
  aiCallTrend: DashboardTrendPoint[] | null
}

export async function getDashboardOverview(token: string | null) {
  return readItem(await apiRequest<DashboardOverview>('/api/v1/dashboard/overview', { token }))
}
