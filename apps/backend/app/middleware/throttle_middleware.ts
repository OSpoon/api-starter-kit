import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Throttle middleware options.
 *
 * - `max`           — maximum number of requests allowed within the window.
 * - `windowSeconds` — sliding window duration in seconds.
 * - `key`           — bucket key strategy: `'ip'` (default) or `'user'`.
 *
 * @note This implementation uses an in-memory store and is suitable for
 * single-instance deployments. For multi-instance production deployments,
 * replace the store with a Redis-backed implementation to share state
 * across all instances.
 */
export interface ThrottleOptions {
  max: number
  windowSeconds: number
  key?: 'ip' | 'user'
}

interface BucketEntry {
  timestamps: number[]
}

const buckets = new Map<string, BucketEntry>()
const CLEANUP_INTERVAL_MS = 60_000
let lastCleanup = Date.now()

/**
 * Whether throttling is enabled. Disabled by default in the test environment
 * to avoid cross-test interference when many requests originate from the
 * same IP within a single suite run. Tests that exercise throttle behavior
 * should call `setThrottleEnabled(true)` and `resetThrottleBuckets()`.
 */
let throttleEnabled = process.env.NODE_ENV !== 'test'

/**
 * Toggle throttling at runtime. Intended for tests that need to verify
 * 429 behavior without affecting other tests in the suite.
 */
export function setThrottleEnabled(enabled: boolean) {
  throttleEnabled = enabled
}

/**
 * Clear all in-memory buckets. Intended for test setup to ensure
 * a clean state between test cases.
 */
export function resetThrottleBuckets() {
  buckets.clear()
  lastCleanup = Date.now()
}

function cleanupExpired(now: number, maxWindowSeconds: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  const cutoff = now - maxWindowSeconds * 1000
  for (const [key, entry] of buckets) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff)
    if (entry.timestamps.length === 0) buckets.delete(key)
  }
}

export default class ThrottleMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: ThrottleOptions) {
    if (!throttleEnabled) {
      return next()
    }

    const now = Date.now()
    cleanupExpired(now, options.windowSeconds)

    const identifier =
      options.key === 'user'
        ? `u:${ctx.auth.user?.id ?? ctx.request.ip()}`
        : `ip:${ctx.request.ip()}`

    const routeKey = ctx.route?.pattern ?? ctx.request.url()
    const bucketKey = `${routeKey}:${identifier}`

    const entry = buckets.get(bucketKey) ?? { timestamps: [] }
    const cutoff = now - options.windowSeconds * 1000
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff)

    if (entry.timestamps.length >= options.max) {
      const oldest = entry.timestamps[0] ?? now
      const retryAfter = Math.ceil((oldest + options.windowSeconds * 1000 - now) / 1000)
      ctx.response.header('Retry-After', String(Math.max(retryAfter, 1)))
      ctx.response.header('X-RateLimit-Limit', String(options.max))
      ctx.response.header('X-RateLimit-Remaining', '0')
      return ctx.response.tooManyRequests({
        code: 'E_RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        retryAfter: Math.max(retryAfter, 1),
      })
    }

    entry.timestamps.push(now)
    buckets.set(bucketKey, entry)
    ctx.response.header('X-RateLimit-Limit', String(options.max))
    ctx.response.header(
      'X-RateLimit-Remaining',
      String(Math.max(options.max - entry.timestamps.length, 0))
    )

    return next()
  }
}
