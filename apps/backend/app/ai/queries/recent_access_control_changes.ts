import {
  maskName,
  queryPageMessage,
  queryPageParameter,
  queryPageSize,
} from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import AuditLog from '#models/audit_log'

export const recentAccessControlChangesQuery: AiQueryTemplate = {
  code: 'recent_access_control_changes',
  permission: 'audit-logs:read',
  version: 2,
  description:
    'List role and historical permission audit events without metadata or unredacted actor details; results can be paginated with params.page.',
  parameters: { page: queryPageParameter },
  async execute(params) {
    const logs = await AuditLog.query()
      .whereIn('action', [
        'role.created',
        'role.updated',
        'role.deleted',
        'permission.created',
        'permission.updated',
        'permission.deleted',
      ])
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
