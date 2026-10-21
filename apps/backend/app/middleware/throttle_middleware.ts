import { createHash } from 'node:crypto'

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import db from '@adonisjs/lucid/services/db'

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

interface BucketEntry {
  timestamps: number[]
}

const buckets = new Map<string, BucketEntry>()
const CLEANUP_INTERVAL_MS = 60_000
let lastCleanup = Date.now()
let lastSharedCleanup = Date.now()
const SHARED_CLEANUP_INTERVAL_MS = 60 * 60 * 1000
const SHARED_BUCKET_RETENTION_MS = 24 * 60 * 60 * 1000

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
  lastSharedCleanup = Date.now()
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

async function consumeSharedBucket(bucketKey: string, options: ThrottleOptions) {
  // shortcut: fixed windows allow boundary bursts, use sliding windows if stricter limits are needed.
  const result = await db.rawQuery(
    `INSERT INTO shared_throttle_buckets (bucket_key, window_started_at, request_count)
     VALUES (
       ?,
       to_timestamp(floor(extract(epoch FROM clock_timestamp()) / ?) * ?),
       1
     )
     ON CONFLICT (bucket_key) DO UPDATE SET
       window_started_at = GREATEST(
         shared_throttle_buckets.window_started_at,
         EXCLUDED.window_started_at
       ),
       request_count = CASE
         WHEN shared_throttle_buckets.window_started_at < EXCLUDED.window_started_at THEN 1
         ELSE LEAST(shared_throttle_buckets.request_count + 1, ?)
       END
     RETURNING request_count AS "requestCount",
       GREATEST(
         1,
         CEIL(EXTRACT(EPOCH FROM (
           window_started_at + (? * INTERVAL '1 second') - clock_timestamp()
         )))::integer
       ) AS "retryAfter"`,
    [
      bucketKey,
      options.windowSeconds,
      options.windowSeconds,
      options.max + 1,
      options.windowSeconds,
    ]
  )
  const row = (
    result as { rows: Array<{ requestCount: number | string; retryAfter: number | string }> }
  ).rows[0]
  if (!row) throw new Error('Shared throttle bucket update returned no row')

  const now = Date.now()
  if (now - lastSharedCleanup >= SHARED_CLEANUP_INTERVAL_MS) {
    await db
      .from('shared_throttle_buckets')
      .where('window_started_at', '<', new Date(now - SHARED_BUCKET_RETENTION_MS))
      .delete()
    lastSharedCleanup = now
  }

  return { count: Number(row.requestCount), retryAfter: Number(row.retryAfter) }
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

    if (options.shared) {
      const sharedKey = createHash('sha256')
        .update(`${bucketKey}:${options.windowSeconds}`)
        .digest('hex')
      const entry = await consumeSharedBucket(sharedKey, options)
      const remaining = Math.max(options.max - entry.count, 0)
      ctx.response.header('X-RateLimit-Limit', String(options.max))
      ctx.response.header('X-RateLimit-Remaining', String(remaining))
      if (entry.count > options.max) {
        ctx.response.header('Retry-After', String(entry.retryAfter))
        return ctx.response.tooManyRequests({
          code: 'E_RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          retryAfter: entry.retryAfter,
        })
      }
      return next()
    }

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
