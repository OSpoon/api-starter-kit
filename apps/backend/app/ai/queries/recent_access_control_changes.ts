import { maskName, queryResultLimit } from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import AuditLog from '#models/audit_log'

export const recentAccessControlChangesQuery: AiQueryTemplate = {
  code: 'recent_access_control_changes',
  version: 1,
  description:
    'List recent role and permission create, update, and delete audit events without metadata or unredacted actor details.',
  permission: 'audit-logs:read',
  parameters: {},
  async execute() {
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
