import type { StoredTrace } from '@earendil-works/pi-telemetry'

import type { AgentTrace } from '../agent.js'

export function toAgentTrace(trace: StoredTrace): AgentTrace {
  return {
    traceId: trace.traceId,
    spans: trace.spans.filter(
      (span) => span.name !== 'pi.ai.request' && span.name !== 'pi.ai.poll'
    ),
  }
}
