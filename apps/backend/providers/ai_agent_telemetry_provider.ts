import type { ApplicationService } from '@adonisjs/core/types'

import {
  shutdownAiAgentTelemetry,
  startAiAgentTelemetry,
} from '#ai/runtime/ai_agent_telemetry_exporter'

export default class AiAgentTelemetryProvider {
  constructor(protected app: ApplicationService) {}

  async start() {
    startAiAgentTelemetry()
  }

  async shutdown() {
    await shutdownAiAgentTelemetry()
  }
}
