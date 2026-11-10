import { test } from '@japa/runner'

import { piAgentEngine } from '#ai/agent/pi'

test.group('AI agent exports', () => {
  test('exposes the current engine from the Pi entry point', ({ assert }) => {
    assert.equal(piAgentEngine.id, 'pi')
  })
})
