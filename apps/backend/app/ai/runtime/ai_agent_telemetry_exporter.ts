import { createHash } from 'node:crypto'

import type { AttributeValue, StoredSpan, StoredTrace } from '@earendil-works/pi-telemetry'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { api, NodeSDK } from '@opentelemetry/sdk-node'

import env from '#start/env'

const serviceName = 'api-starter-kit-backend'
const instrumentationName = '@earendil-works/pi-telemetry'
let telemetrySdk: NodeSDK | undefined

type TelemetryAttribute = AttributeValue | undefined

function getLangfuseConfig() {
  const baseUrl = env.get('LANGFUSE_BASE_URL')?.trim().replace(/\/+$/, '')
  const publicKey = env.get('LANGFUSE_PUBLIC_KEY')?.trim()
  const secretKey = env.get('LANGFUSE_SECRET_KEY')?.release().trim()
  if (!baseUrl || !publicKey || !secretKey) return undefined

  return { baseUrl, publicKey, secretKey }
}

export function isAiTelemetryEnabled() {
  return env.get('NODE_ENV') === 'development'
}

export function hasLangfuseTelemetryDestination() {
  return Boolean(getLangfuseConfig())
}

export function startAiAgentTelemetry() {
  const config = getLangfuseConfig()
  if (!isAiTelemetryEnabled() || !config || telemetrySdk) return

  telemetrySdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({
      url: `${config.baseUrl}/api/public/otel/v1/traces`,
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64')}`,
        'x-langfuse-ingestion-version': '4',
      },
    }),
    metricReaders: [],
    logRecordProcessors: [],
    textMapPropagator: null,
  })
  telemetrySdk.start()
}

export async function shutdownAiAgentTelemetry() {
  await telemetrySdk?.shutdown()
  telemetrySdk = undefined
}

function toOpenTelemetryId(value: string, bytes: number) {
  const id = createHash('sha256').update(value).digest().subarray(0, bytes)
  if (id.every((byte) => byte === 0)) id[id.length - 1] = 1
  return id.toString('hex')
}

function getSpanContextKey(traceId: string, spanId: string) {
  return `${traceId}:${spanId}`
}

function toLangfuseAttributes(span: StoredSpan, conversationId: number) {
  const attributes: Record<string, TelemetryAttribute> = {
    ...span.attributes,
    'langfuse.observation.type':
      span.name === 'api-starter.ai.model_call'
        ? 'generation'
        : span.name === 'api-starter.ai.tool'
          ? 'tool'
          : span.name === 'api-starter.ai.agent_run'
            ? 'agent'
            : 'span',
  }

  if (
    span.name === 'api-starter.ai.model_call' ||
    span.name === 'pi.ai.request' ||
    span.name === 'pi.ai.poll'
  ) {
    const model = span.attributes.model
    if (typeof model === 'string') attributes['langfuse.observation.model.name'] = model

    const usageDetails = Object.fromEntries(
      [
        ['input', span.attributes['usage.input']],
        ['output', span.attributes['usage.output']],
        ['cache_read_input_tokens', span.attributes['usage.cache_read']],
        ['cache_creation_input_tokens', span.attributes['usage.cache_write']],
      ].filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    )
    if (Object.keys(usageDetails).length > 0) {
      attributes['langfuse.observation.usage_details'] = JSON.stringify(usageDetails)
    }

    const totalCost = span.attributes['cost.total']
    if (typeof totalCost === 'number') {
      attributes['langfuse.observation.cost_details'] = JSON.stringify({ total: totalCost })
    }
  }

  if (!span.parentId) {
    attributes['langfuse.trace.name'] = 'AI agent run'
    attributes['langfuse.trace.metadata.agentRunId'] = span.attributes['app.ai.agent_run_id']
  }
  attributes['langfuse.session.id'] = String(conversationId)

  if (span.status.status === 'error') {
    attributes['langfuse.observation.level'] = 'ERROR'
    if (span.status.error?.message) {
      attributes['langfuse.observation.status_message'] = span.status.error.message
    }
  }

  return Object.fromEntries(
    Object.entries(attributes).filter(
      (entry): entry is [string, AttributeValue] => entry[1] !== undefined
    )
  ) as api.Attributes
}

function toOpenTelemetryLinks(
  span: StoredSpan,
  recordedSpanContexts: ReadonlyMap<string, api.SpanContext>
): api.Link[] {
  return span.links.map((link) => ({
    context: recordedSpanContexts.get(getSpanContextKey(link.traceId, link.spanId)) ?? {
      traceId: toOpenTelemetryId(link.traceId, 16),
      spanId: toOpenTelemetryId(link.spanId, 8),
      traceFlags: api.TraceFlags.SAMPLED,
      isRemote: true,
    },
    attributes: Object.fromEntries(
      Object.entries(link.attributes ?? {}).filter((entry) => entry[1] !== undefined)
    ) as api.Attributes,
  }))
}

export async function exportAiAgentTraceToLangfuse(trace: StoredTrace, conversationId: number) {
  if (!isAiTelemetryEnabled() || !hasLangfuseTelemetryDestination() || !telemetrySdk) return
  if (trace.spans.length === 0) return

  const tracer = api.trace.getTracer(instrumentationName, '1.4.0')
  const recordedSpans = new Map<string, api.Span>()
  const recordedSpanContexts = new Map<string, api.SpanContext>()

  for (const storedSpan of trace.spans) {
    const parentSpan = storedSpan.parentId ? recordedSpans.get(storedSpan.parentId) : undefined
    const parentContext = parentSpan
      ? api.trace.setSpan(api.context.active(), parentSpan)
      : undefined
    const span = tracer.startSpan(
      storedSpan.name,
      {
        startTime: storedSpan.startedMs,
        attributes: toLangfuseAttributes(storedSpan, conversationId),
        links: toOpenTelemetryLinks(storedSpan, recordedSpanContexts),
      },
      parentContext
    )

    for (const event of storedSpan.events) {
      span.addEvent(
        event.name,
        Object.fromEntries(
          Object.entries(event.attributes).filter((entry) => entry[1] !== undefined)
        ) as api.Attributes,
        storedSpan.startedMs + event.timeMs
      )
    }

    if (storedSpan.status.status === 'error') {
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: storedSpan.status.error?.message })
    } else {
      span.setStatus({ code: api.SpanStatusCode.OK })
    }
    span.end(storedSpan.endedMs)
    recordedSpans.set(storedSpan.id, span)
    recordedSpanContexts.set(
      getSpanContextKey(storedSpan.traceId, storedSpan.id),
      span.spanContext()
    )
  }
}
