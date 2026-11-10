import type { StoredTrace } from '@earendil-works/pi-telemetry'
import { describe, expect, it } from 'vitest'

import { toAgentTrace } from '../../src/pi/trace.js'

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

describe('Pi trace adapter', () => {
  it('exposes agent traces without redundant Pi request spans', () => {
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

    expect(toAgentTrace(trace).spans.map((span) => span.name)).toEqual([
      'api-starter.ai.agent_run',
      'api-starter.ai.model_call',
      'api-starter.ai.tool',
    ])
  })
})
