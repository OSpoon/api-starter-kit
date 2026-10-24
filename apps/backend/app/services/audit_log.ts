import type { HttpContext } from '@adonisjs/core/http'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

import AuditLog from '#models/audit_log'
import { getRequestCorrelation } from '#support/request_correlation'

export type AuditEvent = {
  actorUserId: number | null
  actorType?: 'user' | 'api_key' | 'system' | 'anonymous'
  source?: AuditEventSource
  outcome?: AuditEventOutcome
  reasonCode?: string
  action: string
  targetType: string
  targetId?: number | string | null
  metadata?: Record<string, unknown>
}

export type AuditEventSource =
  | 'http'
  | 'api_key'
  | 'ai_agent'
  | 'channel'
  | 'wecom'
  | 'feishu'
  | 'dingtalk'
  | 'test'
  | 'system'
  | 'legacy'

export type AuditEventOutcome =
  | 'success'
  | 'unknown'
  | 'denied'
  | 'failure'
  | 'attempted'
  | 'expired'
  | 'cancelled'

function normalizeSource(source: unknown, ctx?: HttpContext | null): AuditEventSource {
  if (
    ctx?.auditChannel &&
    (source === 'ai_agent' || source === 'channel' || source === undefined)
  ) {
    return ctx.auditChannel
  }
  if (source === 'session') return 'http'
  if (source === 'api') return ctx?.integrationApiKey ? 'api_key' : 'http'
  if (
    source === 'http' ||
    source === 'api_key' ||
    source === 'ai_agent' ||
    source === 'channel' ||
    source === 'wecom' ||
    source === 'feishu' ||
    source === 'dingtalk' ||
    source === 'test' ||
    source === 'system' ||
    source === 'legacy'
  ) {
    return source
  }
  return ctx ? (ctx.integrationApiKey ? 'api_key' : 'http') : 'system'
}

function normalizeOutcome(value: unknown, action: string): AuditEventOutcome {
  if (
    value === 'success' ||
    value === 'unknown' ||
    value === 'denied' ||
    value === 'failure' ||
    value === 'attempted' ||
    value === 'expired' ||
    value === 'cancelled'
  ) {
    return value
  }
  if (value === 'sent') return 'success'
  if (value === 'failed') return 'failure'
  if (value === 'attempted') return 'attempted'
  if (action.endsWith('_rejected') || action.endsWith('_denied')) return 'denied'
  if (action.endsWith('_failed')) return 'failure'
  if (action.endsWith('_expired')) return 'expired'
  if (action.endsWith('_cancelled')) return 'cancelled'
  return 'success'
}

function normalizeActorType(value: unknown, actorUserId: number | null, ctx?: HttpContext | null) {
  if (ctx?.integrationApiKey) return 'api_key'
  if (value === 'user' || value === 'api_key' || value === 'system' || value === 'anonymous') {
    return value
  }
  if (actorUserId !== null) return 'user'
  return ctx ? 'anonymous' : 'system'
}

export async function recordAuditEvent(
  ctx: HttpContext | null | undefined,
  event: AuditEvent,
  transaction?: TransactionClientContract
) {
  const request = ctx?.request as
    | (HttpContext['request'] & {
        id?: () => string | undefined
        ip?: () => string
        method?: () => string
        header?: (name: string) => string | undefined
      })
    | undefined
  const correlation =
    request && typeof request.id === 'function' ? getRequestCorrelation(ctx!) : null
  const metadata = event.metadata ?? {}
  const source = normalizeSource(event.source ?? metadata.source, ctx)
  const outcome = normalizeOutcome(event.outcome ?? metadata.outcome, event.action)
  const actorType = normalizeActorType(
    event.actorType ?? metadata.actorType,
    event.actorUserId,
    ctx
  )
  const reason = event.reasonCode ?? metadata.reason

  await AuditLog.create(
    {
      actorUserId: event.actorUserId,
      eventVersion: 1,
      actorType,
      source,
      outcome,
      reasonCode: typeof reason === 'string' ? reason.slice(0, 120) : null,
      action: event.action,
      targetType: event.targetType,
      targetId:
        event.targetId === undefined || event.targetId === null
          ? null
          : String(event.targetId).slice(0, 120),
      metadata: ctx?.integrationApiKey
        ? { ...metadata, integrationApiKeyId: ctx.integrationApiKey.id }
        : (event.metadata ?? null),
      ipAddress: typeof request?.ip === 'function' ? request.ip() : null,
      userAgent: request?.header?.('user-agent')?.slice(0, 512) ?? null,
      requestId: correlation?.requestId.slice(0, 120) ?? null,
      traceId: correlation?.traceId.slice(0, 120) ?? null,
      requestMethod: request?.method?.().slice(0, 12) ?? null,
      requestRoute: ctx?.route?.pattern?.slice(0, 512) ?? null,
    },
    transaction ? { client: transaction } : undefined
  )
}
