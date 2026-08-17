import { test } from '@japa/runner'

import { shouldStopAfterPiToolTurn } from '#services/ai_agent_pi_runtime'

function result(kind: string) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ kind }) }],
    terminate: kind === 'confirmation' || kind.endsWith('_error'),
  }
}

test.group('Pi Agent runtime guards', () => {
  test('stops after confirmation and terminal tool errors', ({ assert }) => {
    assert.isTrue(shouldStopAfterPiToolTurn([result('confirmation')]))
    assert.isTrue(shouldStopAfterPiToolTurn([result('action_error')]))
    assert.isTrue(shouldStopAfterPiToolTurn([result('query_error')]))
    assert.isTrue(shouldStopAfterPiToolTurn([{ isError: true }]))
  })

  test('honors Pi native termination metadata', ({ assert }) => {
    assert.isTrue(shouldStopAfterPiToolTurn([result('confirmation')]))
    assert.isFalse(shouldStopAfterPiToolTurn([result('query_result')]))
  })

  test('continues after successful structured data tools', ({ assert }) => {
    assert.isFalse(shouldStopAfterPiToolTurn([result('query_result')]))
    assert.isFalse(shouldStopAfterPiToolTurn([{ content: [{ type: 'text', text: 'knowledge' }] }]))
    assert.isFalse(shouldStopAfterPiToolTurn([]))
  })
})
