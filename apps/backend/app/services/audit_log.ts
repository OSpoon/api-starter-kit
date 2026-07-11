import type { HttpContext } from '@adonisjs/core/http'

import AuditLog from '#models/audit_log'

export type AuditEvent = {
  actorUserId: number | null
  action: string
  targetType: string
  targetId?: number | string | null
  metadata?: Record<string, unknown>
}

export async function recordAuditEvent(ctx: HttpContext, event: AuditEvent) {
  await AuditLog.create({
    actorUserId: event.actorUserId,
    action: event.action,
    targetType: event.targetType,
    targetId:
      event.targetId === undefined || event.targetId === null ? null : String(event.targetId),
    metadata: event.metadata ?? null,
    ipAddress: ctx.request.ip(),
    userAgent: ctx.request.header('user-agent')?.slice(0, 512) ?? null,
    requestId: ctx.request.header('x-request-id')?.slice(0, 120) ?? null,
  })
}
