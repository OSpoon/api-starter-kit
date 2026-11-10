import type { StoredTrace } from '@earendil-works/pi-telemetry'
import { test } from '@japa/runner'

import { toAgentTrace } from '#ai/agent/pi/trace'

function makeSpan(name: string): StoredTrace['spans'][number] {
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

test.group('Pi trace adapter', () => {
  test('exposes agent traces without redundant Pi request spans', ({ assert }) => {
    const trace: StoredTrace = {
      traceId: 'trace-1',
      spans: [
        makeSpan('api-starter.ai.agent_run'),
        makeSpan('api-starter.ai.model_call'),
        makeSpan('pi.ai.request'),
        makeSpan('pi.ai.poll'),
        makeSpan('api-starter.ai.tool'),
      ],
    }

    assert.deepEqual(
      toAgentTrace(trace).spans.map((span) => span.name),
      ['api-starter.ai.agent_run', 'api-starter.ai.model_call', 'api-starter.ai.tool']
    )
  })
})
