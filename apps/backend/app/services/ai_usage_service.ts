import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

import AiUsageEvent, { type AiUsageEventStatus } from '#models/ai_usage_event'
import {
  calculateModelsDevCost,
  resolveModelsDevPricing,
} from '#services/models_dev_pricing_service'

type AiUsageInput = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
}

export async function recordAiUsageEvent(input: {
  userId: number
  conversationId: number
  agentRunId: string
  callSequence: number
  providerId: string
  modelId: string
  baseUrl: string
  usage: AiUsageInput
  status: AiUsageEventStatus
}) {
  const pricing = await resolveModelsDevPricing(input.modelId, input.baseUrl)
  const estimatedCostUsd = pricing
    ? calculateModelsDevCost(input.usage, pricing.cost).toFixed(12)
    : null

  await AiUsageEvent.create({
    userId: input.userId,
    conversationId: input.conversationId,
    agentRunId: input.agentRunId,
    callSequence: input.callSequence,
    providerId: input.providerId,
    modelId: input.modelId,
    inputTokens: input.usage.input,
    outputTokens: input.usage.output,
    cacheReadTokens: input.usage.cacheRead,
    cacheWriteTokens: input.usage.cacheWrite,
    totalTokens: input.usage.totalTokens,
    estimatedCostUsd,
    pricingSource: pricing ? 'models.dev' : 'unavailable',
    pricingVersion: pricing?.version ?? null,
    status: input.status,
  })
}

type UsageSummaryRow = {
  inputTokens: string | number
  outputTokens: string | number
  cacheReadTokens: string | number
  cacheWriteTokens: string | number
  totalTokens: string | number
  modelCalls: string | number
  estimatedCostUsd: string | number | null
  unpricedModelCount: string | number
}

type UsageModelRow = {
  modelId: string
  providerId: string
  inputTokens: string | number
  outputTokens: string | number
  cacheReadTokens: string | number
  cacheWriteTokens: string | number
  totalTokens: string | number
  modelCalls: string | number
  estimatedCostUsd: string | number | null
  priced: boolean
}

export type AiUsageOverview = {
  period: 'current_month'
  periodStart: string
  periodEnd: string
  totalTokens: number
  modelCalls: number
  estimatedCostUsd: number | null
  pricingSource: 'models.dev' | 'mixed' | 'unavailable'
  unpricedModelCount: number
}

function numberValue(value: string | number | null | undefined) {
  return value === null || value === undefined ? 0 : Number(value)
}

export async function getAiUsageOverview(): Promise<AiUsageOverview> {
  const periodStart = DateTime.now().startOf('month')
  const periodEnd = DateTime.now()
  const row = (await db
    .from('ai_usage_events')
    .where('created_at', '>=', periodStart.toJSDate())
    .where('created_at', '<=', periodEnd.toJSDate())
    .select(
      db.raw('COALESCE(SUM(total_tokens), 0)::text AS "totalTokens"'),
      db.raw('COUNT(*)::text AS "modelCalls"'),
      db.raw('SUM(estimated_cost_usd)::text AS "estimatedCostUsd"'),
      db.raw(
        `COUNT(DISTINCT CASE WHEN estimated_cost_usd IS NULL THEN model_id END)::text AS "unpricedModelCount"`
      )
    )
    .first()) as
    | {
        totalTokens: string | number
        modelCalls: string | number
        estimatedCostUsd: string | number | null
        unpricedModelCount: string | number
      }
    | undefined

  const estimatedCostUsd = row?.estimatedCostUsd
  const unpricedModelCount = numberValue(row?.unpricedModelCount)

  return {
    period: 'current_month',
    periodStart: periodStart.toISO(),
    periodEnd: periodEnd.toISO(),
    totalTokens: numberValue(row?.totalTokens),
    modelCalls: numberValue(row?.modelCalls),
    estimatedCostUsd: estimatedCostUsd === null ? null : numberValue(estimatedCostUsd),
    pricingSource:
      estimatedCostUsd === null ? 'unavailable' : unpricedModelCount > 0 ? 'mixed' : 'models.dev',
    unpricedModelCount,
  }
}

export async function getAiUsageSummary(userId: number) {
  const periodStart = DateTime.now().startOf('month')
  const periodEnd = DateTime.now()
  const scope = (query: ReturnType<typeof db.from>) =>
    query
      .where('user_id', userId)
      .where('created_at', '>=', periodStart.toJSDate())
      .where('created_at', '<=', periodEnd.toJSDate())

  const totalsResult = (await scope(db.from('ai_usage_events'))
    .select(
      db.raw('COALESCE(SUM(input_tokens), 0)::text AS "inputTokens"'),
      db.raw('COALESCE(SUM(output_tokens), 0)::text AS "outputTokens"'),
      db.raw('COALESCE(SUM(cache_read_tokens), 0)::text AS "cacheReadTokens"'),
      db.raw('COALESCE(SUM(cache_write_tokens), 0)::text AS "cacheWriteTokens"'),
      db.raw('COALESCE(SUM(total_tokens), 0)::text AS "totalTokens"'),
      db.raw('COUNT(*)::text AS "modelCalls"'),
      db.raw('SUM(estimated_cost_usd)::text AS "estimatedCostUsd"'),
      db.raw(
        `COUNT(DISTINCT CASE WHEN estimated_cost_usd IS NULL THEN model_id END)::text AS "unpricedModelCount"`
      )
    )
    .first()) as UsageSummaryRow | undefined

  const modelRows = (await scope(db.from('ai_usage_events'))
    .select('model_id as modelId', 'provider_id as providerId')
    .sum({ inputTokens: 'input_tokens' })
    .sum({ outputTokens: 'output_tokens' })
    .sum({ cacheReadTokens: 'cache_read_tokens' })
    .sum({ cacheWriteTokens: 'cache_write_tokens' })
    .sum({ totalTokens: 'total_tokens' })
    .count({ modelCalls: '*' })
    .sum({ estimatedCostUsd: 'estimated_cost_usd' })
    .select(db.raw('BOOL_AND(estimated_cost_usd IS NOT NULL) AS priced'))
    .groupBy('model_id', 'provider_id')
    .orderBy('totalTokens', 'desc')) as unknown as UsageModelRow[]

  const estimatedCostUsd = totalsResult?.estimatedCostUsd
  const unpricedModelCount = numberValue(totalsResult?.unpricedModelCount)

  return {
    period: 'current_month' as const,
    periodStart: periodStart.toISO(),
    periodEnd: periodEnd.toISO(),
    inputTokens: numberValue(totalsResult?.inputTokens),
    outputTokens: numberValue(totalsResult?.outputTokens),
    cacheReadTokens: numberValue(totalsResult?.cacheReadTokens),
    cacheWriteTokens: numberValue(totalsResult?.cacheWriteTokens),
    totalTokens: numberValue(totalsResult?.totalTokens),
    modelCalls: numberValue(totalsResult?.modelCalls),
    estimatedCostUsd: estimatedCostUsd === null ? null : numberValue(estimatedCostUsd),
    pricingSource:
      estimatedCostUsd === null
        ? ('unavailable' as const)
        : unpricedModelCount > 0
          ? ('mixed' as const)
          : ('models.dev' as const),
    unpricedModelCount,
    models: modelRows.map((row) => ({
      modelId: row.modelId,
      providerId: row.providerId,
      inputTokens: numberValue(row.inputTokens),
      outputTokens: numberValue(row.outputTokens),
      cacheReadTokens: numberValue(row.cacheReadTokens),
      cacheWriteTokens: numberValue(row.cacheWriteTokens),
      totalTokens: numberValue(row.totalTokens),
      modelCalls: numberValue(row.modelCalls),
      estimatedCostUsd: row.estimatedCostUsd === null ? null : numberValue(row.estimatedCostUsd),
      priced: Boolean(row.priced),
    })),
  }
}
