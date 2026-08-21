import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Logs the HTTP lifecycle without recording request bodies or credentials.
 * Request-scoped logging automatically includes Adonis' request id.
 */
export default class HttpLoggingMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response, logger } = ctx
    const startedAt = process.hrtime.bigint()
    const requestId = request.id()
    const method = request.method()
    const url = request.url()
    const queryKeys = Object.keys(request.qs())

    logger.info(
      {
        requestId,
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
          requestId,
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
          requestId,
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
