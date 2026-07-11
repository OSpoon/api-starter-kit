import type { HttpContext } from '@adonisjs/core/http'

import AuditLog from '#models/audit_log'

function serializeAuditLog(log: AuditLog) {
  return {
    id: log.id,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    metadata: log.metadata,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    requestId: log.requestId,
    createdAt: log.createdAt,
    actor: log.actor
      ? { id: log.actor.id, fullName: log.actor.fullName, email: log.actor.email }
      : null,
  }
}

export default class AuditLogsController {
  async index({ request, serialize }: HttpContext) {
    const page = Math.max(Number(request.input('page', 1)) || 1, 1)
    const limit = Math.min(Math.max(Number(request.input('limit', 20)) || 20, 1), 100)
    const paginator = await AuditLog.query()
      .preload('actor')
      .orderBy('id', 'desc')
      .paginate(page, limit)

    return serialize({
      items: paginator.all().map(serializeAuditLog),
      meta: paginator.getMeta(),
    })
  }
}
