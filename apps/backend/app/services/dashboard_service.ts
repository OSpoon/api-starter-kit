import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

import { getAiUsageOverview } from '#services/ai_usage_service'

type DashboardTrendPoint = {
  date: string
  count: number
}

export type DashboardOverview = {
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

async function countRows(query: ReturnType<typeof db.from>) {
  const row = await query.count({ total: '*' }).first()
  return Number(row?.total ?? 0)
}

async function countByDay(table: 'audit_logs' | 'ai_usage_events', start: DateTime) {
  const dateSql = "TO_CHAR(created_at, 'YYYY-MM-DD')"
  const rows = (await db
    .from(table)
    .where('created_at', '>=', start.toJSDate())
    .select(db.raw(`${dateSql} AS date`))
    .count({ total: '*' })
    .groupByRaw(dateSql)) as Array<{ date: string; total: string | number }>
  const countByDate = new Map(rows.map((row) => [row.date, Number(row.total)]))

  return Array.from({ length: 7 }, (_, index) => {
    const date = start.plus({ days: index }).toISODate()!
    return { date, count: countByDate.get(date) ?? 0 }
  })
}

export async function getDashboardOverview(
  bouncer: HttpContext['bouncer']
): Promise<DashboardOverview> {
  const [
    canReadUsers,
    canReadRoles,
    canReadApiKeys,
    canManageKnowledge,
    canReadAuditLogs,
    canReadAi,
  ] = await Promise.all([
    bouncer.allows('access', 'users:read'),
    bouncer.allows('access', 'roles:read'),
    bouncer.allows('access', 'api-keys:read'),
    bouncer.allows('access', 'knowledge:manage'),
    bouncer.allows('access', 'audit-logs:read'),
    bouncer.allows('access', 'system-status:read'),
  ])

  const now = DateTime.now()
  const weekStart = now.startOf('day').minus({ days: 6 })
  const [
    activeUsers,
    roles,
    activeApiKeys,
    knowledgeDocuments,
    auditEvents,
    aiUsage,
    auditTrend,
    aiCallTrend,
  ] = await Promise.all([
    canReadUsers ? countRows(db.from('users').whereNull('disabled_at')) : null,
    canReadRoles ? countRows(db.from('roles')) : null,
    canReadApiKeys
      ? countRows(
          db
            .from('api_keys')
            .whereNull('revoked_at')
            .where((query) =>
              query.whereNull('expires_at').orWhere('expires_at', '>', now.toJSDate())
            )
        )
      : null,
    canManageKnowledge ? countRows(db.from('knowledge_documents')) : null,
    canReadAuditLogs
      ? countRows(db.from('audit_logs').where('created_at', '>=', weekStart.toJSDate()))
      : null,
    canReadAi ? getAiUsageOverview() : null,
    canReadAuditLogs ? countByDay('audit_logs', weekStart) : null,
    canReadAi ? countByDay('ai_usage_events', weekStart) : null,
  ])

  return {
    generatedAt: now.toISO() ?? new Date().toISOString(),
    activeUsers,
    roles,
    activeApiKeys,
    knowledgeDocuments,
    auditEvents,
    aiModelCalls: aiUsage?.modelCalls ?? null,
    aiTokensUsed: aiUsage?.totalTokens ?? null,
    auditTrend,
    aiCallTrend,
  }
}
