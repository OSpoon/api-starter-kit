import { randomUUID } from 'node:crypto'

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

import { setRequestCorrelation } from '#support/request_correlation'

const correlationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/

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
 * Logs the HTTP lifecycle without recording request bodies or credentials.
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
    const url = request.url()
    const queryKeys = Object.keys(request.qs())

    logger.info(
      {
        traceId,
        method,
        url,
        queryKeys,
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

      logger.info(
        {
          traceId,
          method,
          url,
          route: ctx.route?.pattern ?? null,
          status,
          durationMs: Number(durationMs.toFixed(2)),
          userId: ctx.auth?.user?.id ?? null,
        },
        'HTTP request completed'
      )
    }
  }
}
