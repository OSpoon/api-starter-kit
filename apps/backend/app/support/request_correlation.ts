import { randomUUID } from 'node:crypto'

import type { HttpContext } from '@adonisjs/core/http'

export type RequestCorrelation = {
  requestId: string
  traceId: string
}

const correlations = new WeakMap<HttpContext, RequestCorrelation>()

export function setRequestCorrelation(ctx: HttpContext, correlation: RequestCorrelation) {
  correlations.set(ctx, correlation)
}

export function getRequestCorrelation(ctx: HttpContext): RequestCorrelation {
  const requestId = ctx.request.id() ?? randomUUID()

  return (
    correlations.get(ctx) ?? {
      requestId,
      traceId: ctx.request.header('x-trace-id') ?? requestId,
    }
  )
}
