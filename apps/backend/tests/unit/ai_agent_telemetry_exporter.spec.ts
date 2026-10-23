import type { StoredSpan, StoredTrace } from '@earendil-works/pi-telemetry'
import { test } from '@japa/runner'

import { getExportableTraceSpans } from '#ai/runtime/ai_agent_telemetry_exporter'

function makeSpan(name: string): StoredSpan {
  return {
    id: name,
    traceId: 'trace-1',
    name,
    startedMs: 0,
    endedMs: 1,
    attributes: {},
    events: [],
    links: [],
    status: { status: 'ok' },
  }
}

test('omits redundant Pi request spans from Langfuse traces', ({ assert }) => {
  const trace: Pick<StoredTrace, 'spans'> = {
    spans: [
      makeSpan('api-starter.ai.agent_run'),
      makeSpan('api-starter.ai.model_call'),
      makeSpan('pi.ai.request'),
      makeSpan('pi.ai.poll'),
      makeSpan('api-starter.ai.tool'),
    ],
  }

  assert.deepEqual(
    getExportableTraceSpans(trace).map((span) => span.name),
    ['api-starter.ai.agent_run', 'api-starter.ai.model_call', 'api-starter.ai.tool']
  )
})
