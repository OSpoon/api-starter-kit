import { maskName, queryResultLimit } from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import AuditLog from '#models/audit_log'

export const recentAuditLogsQuery: AiQueryTemplate = {
  code: 'recent_audit_logs',
  version: 1,
  description:
    'List recent audit events without IP addresses, user agents, or unredacted actor email addresses.',
  permission: 'audit-logs:read',
  parameters: {},
  async execute() {
    const logs = await AuditLog.query()
      .preload('actor')
      .orderBy('id', 'desc')
      .limit(queryResultLimit)
    return {
      rows: logs.map((log) => ({
        id: log.id,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        createdAt: log.createdAt.toISO(),
        actor: log.actor ? { fullName: maskName(log.actor.fullName ?? '') } : null,
      })),
    }
  },
}
