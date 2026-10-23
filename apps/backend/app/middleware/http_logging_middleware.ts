import { randomUUID } from 'node:crypto'

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

import env from '#start/env'
import { setRequestCorrelation } from '#support/request_correlation'

const correlationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/
const maxBodyLogBytes = 16 * 1024
const maxBodyLogDepth = 12
const maxBodyLogNodes = 1_000
// shortcut: free-text secrets evade key redaction; revisit when routes define field-level logging schemas.
const bodyLogRoutes = new Set(
  (env.get('HTTP_BODY_ROUTES') ?? '')
    .split(',')
    .map((route) => route.trim())
    .filter(Boolean)
)
const sensitiveFieldNames = new Set([
  'apikey',
  'authorization',
  'bindingcode',
  'birthdate',
  'code',
  'cookie',
  'dateofbirth',
  'email',
  'familyname',
  'firstname',
  'fullname',
  'givenname',
  'lastname',
  'mobile',
  'name',
  'otp',
  'password',
  'passwd',
  'passphrase',
  'phone',
  'privatekey',
  'recoverycode',
  'secret',
  'session',
  'totp',
  'token',
  'username',
  'webhook',
])
const sensitiveFieldParts = [
  'accesskey',
  'address',
  'authorization',
  'apikey',
  'backupcode',
  'cookie',
  'credential',
  'email',
  'passphrase',
  'password',
  'phone',
  'privatekey',
  'recoverycode',
  'secret',
  'twofactor',
  'verificationcode',
]

function isSensitiveField(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  return (
    sensitiveFieldNames.has(normalized) ||
    sensitiveFieldParts.some((part) => normalized.includes(part)) ||
    normalized.endsWith('apikey') ||
    normalized.endsWith('token') ||
    normalized.endsWith('webhookurl')
  )
}

function prepareBodyForLog(value: unknown) {
  if (value === null || value === undefined) return undefined
  let nodes = 0
  let bytes = 0
  const seen = new WeakSet<object>()

  const visit = (current: unknown, key = '', depth = 0): unknown => {
    if (key && isSensitiveField(key)) return '[REDACTED]'
    if (depth > maxBodyLogDepth || ++nodes > maxBodyLogNodes) throw new Error('Body log limit')
    if (typeof current === 'string') {
      bytes += Buffer.byteLength(current)
      if (bytes > maxBodyLogBytes) throw new Error('Body log limit')
      return current
    }
    if (current === null || typeof current !== 'object') return current
    if (Buffer.isBuffer(current) || ArrayBuffer.isView(current)) throw new Error('Binary body')
    if (current instanceof Date) return current.toISOString()
    if (seen.has(current)) throw new Error('Circular body')
    seen.add(current)

    if (Array.isArray(current)) return current.map((item) => visit(item, '', depth + 1))

    return Object.fromEntries(
      Object.entries(current).map(([childKey, childValue]) => {
        bytes += Buffer.byteLength(childKey)
        if (bytes > maxBodyLogBytes) throw new Error('Body log limit')
        return [childKey, visit(childValue, childKey, depth + 1)]
      })
    )
  }

  try {
    const redacted = visit(value)
    const serialized = JSON.stringify(redacted)
    if (!serialized) return undefined
    const size = Buffer.byteLength(serialized)
    return size <= maxBodyLogBytes
      ? redacted
      : { omitted: true, reason: 'body exceeds log size limit', sizeBytes: size }
  } catch {
    return { omitted: true, reason: 'body exceeds log limits or is not JSON-safe' }
  }
}

function isJsonContentType(value: unknown): value is string {
  return typeof value === 'string' && /^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(value)
}

function getJsonRequestBody(ctx: HttpContext) {
  if (!isJsonContentType(ctx.request.header('content-type'))) return undefined
  try {
    return ctx.request.body()
  } catch {
    return undefined
  }
}

function getJsonResponseBody(ctx: HttpContext) {
  if (!isJsonContentType(ctx.response.getHeader('content-type'))) return undefined
  try {
    const body = ctx.response.getBody()
    return typeof body === 'string' ? (JSON.parse(body) as unknown) : body
  } catch {
    return undefined
  }
}

function getCorrelationId(value: string | undefined) {
  return value && correlationIdPattern.test(value) ? value : randomUUID()
}

function getTraceId(ctx: HttpContext) {
  const traceId = ctx.request.header('x-trace-id')
  if (traceId && correlationIdPattern.test(traceId)) return traceId

  const traceparent = ctx.request.header('traceparent')
  const traceparentMatch = traceparent?.match(/^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/i)
  return traceparentMatch?.[1] ?? randomUUID()
}

/**
 * Logs HTTP metadata by default; opt-in JSON bodies are redacted and bounded.
 * Request-scoped logging automatically includes Adonis' request id.
 */
export default class HttpLoggingMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response, logger } = ctx
    const startedAt = process.hrtime.bigint()
    const requestId = getCorrelationId(request.header('x-request-id') ?? request.id())
    const traceId = getTraceId(ctx)

    setRequestCorrelation(ctx, { requestId, traceId })
    response.header('x-request-id', requestId)
    response.header('x-trace-id', traceId)

    const method = request.method()
    const url = request.url().split('?')[0] || '/'
    const queryKeys = Object.keys(request.qs())
    const clientIp = request.ip()

    response.response.once('finish', () => {
      const route = ctx.route?.pattern ?? null
      if (!route || !bodyLogRoutes.has(`${method} ${route}`)) return

      try {
        const requestBody = prepareBodyForLog(getJsonRequestBody(ctx))
        const responseBody = prepareBodyForLog(getJsonResponseBody(ctx))
        if (requestBody === undefined && responseBody === undefined) return

        logger.info(
          {
            traceId,
            method,
            route,
            status: response.getStatus(),
            requestBody,
            responseBody,
          },
          'HTTP request and response bodies'
        )
      } catch (error) {
        logger.warn(
          { err: error, traceId, method, route },
          'HTTP request and response body logging failed'
        )
      }
    })

    logger.info(
      {
        traceId,
        method,
        url,
        queryKeys,
        clientIp,
        userAgent: request.header('user-agent')?.slice(0, 160) ?? null,
      },
      'HTTP request started'
    )

    try {
      await next()
    } catch (error) {
      logger.error(
        {
          err: error,
          traceId,
          method,
          url,
        },
        'HTTP request failed'
      )
      throw error
    } finally {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
      const status = response.getStatus()
      const route = ctx.route?.pattern ?? null

      logger.info(
        {
          traceId,
          method,
          url,
          route,
          status,
          durationMs: Number(durationMs.toFixed(2)),
          userId: ctx.auth?.user?.id ?? null,
        },
        'HTTP request completed'
      )
    }
  }
}
