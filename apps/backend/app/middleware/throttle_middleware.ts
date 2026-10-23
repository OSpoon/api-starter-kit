import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { errors } from '@adonisjs/limiter'
import limiter from '@adonisjs/limiter/services/main'

/**
 * Throttle middleware options.
 *
 * - `max`           — maximum number of requests allowed within the window.
 * - `windowSeconds` — limit window duration in seconds.
 * - `key`           — bucket key strategy: `'ip'` (default) or `'user'`.
 * - `shared`        — store buckets in the database for cross-process limits.
 *
 * @note Default buckets are process-local. Set `shared` to use the database
 * for cross-process limits.
 */
export interface ThrottleOptions {
  max: number
  windowSeconds: number
  key?: 'ip' | 'user'
  shared?: boolean
}

export default class ThrottleMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: ThrottleOptions) {
    const identifier =
      options.key === 'user'
        ? `u:${ctx.auth.user?.id ?? ctx.request.ip()}`
        : `ip:${ctx.request.ip()}`
    const routeKey = ctx.route?.pattern ?? ctx.request.url()
    const httpLimiter = limiter
      .allowRequests(options.max)
      .every(options.windowSeconds)
      .store(options.shared ? 'database' : 'memory')
      .usingKey(identifier)

    try {
      const result = await httpLimiter.throttle(routeKey, ctx)
      ctx.response.header('X-RateLimit-Limit', String(result.limit))
      ctx.response.header('X-RateLimit-Remaining', String(result.remaining))
      return next()
    } catch (error) {
      if (!(error instanceof errors.E_TOO_MANY_REQUESTS)) throw error

      const retryAfter = Math.max(error.response.availableIn, 1)
      ctx.response.header('Retry-After', String(retryAfter))
      ctx.response.header('X-RateLimit-Limit', String(error.response.limit))
      ctx.response.header('X-RateLimit-Remaining', '0')
      return ctx.response.tooManyRequests({
        code: 'E_RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        retryAfter,
      })
    }
  }
}
