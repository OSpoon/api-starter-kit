import type { AgentTool as PiTool } from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'

import type { AgentToolParameters } from '../agent.js'

export function toPiToolParameters(parameters: AgentToolParameters): PiTool['parameters'] {
  return Type.Unsafe(parameters as PiTool['parameters'])
}
