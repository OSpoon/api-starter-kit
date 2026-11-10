import assert from 'node:assert/strict'

import { piAgentEngine } from '@api-starter-kit/ai-agent/pi'
import { it } from 'vitest'

it('exposes the current engine from the supported Pi entry point', () => {
  assert.equal(piAgentEngine.id, 'pi')
})
