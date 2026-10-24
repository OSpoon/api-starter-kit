import {
  maskName,
  queryPageMessage,
  queryPageParameter,
  queryPageSize,
} from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import AuditLog from '#models/audit_log'

export const recentAuditLogsQuery: AiQueryTemplate = {
  code: 'recent_audit_logs',
  version: 2,
  description:
    'List audit events without IP addresses, user agents, or unredacted actor email addresses; results can be paginated with params.page.',
  permission: 'audit-logs:read',
  parameters: { page: queryPageParameter },
  async execute(params) {
    const logs = await AuditLog.query()
      .preload('actor')
      .orderBy('id', 'desc')
      .paginate(params.page as number, queryPageSize)
    return {
      rows: logs.all().map((log) => ({
        id: log.id,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        createdAt: log.createdAt.toISO(),
        actor: log.actor ? { fullName: maskName(log.actor.fullName ?? '') } : null,
      })),
      message: queryPageMessage(logs.getMeta()),
    }
  },
}
