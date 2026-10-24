import { test } from '@japa/runner'

import { shouldStopPiAfterTurn, trimPiContextToTokenBudget } from '#ai/runtime/ai_agent_pi_runtime'

test.group('Pi agent runtime', () => {
  test('keeps complete persistence history separate from the token-bounded model context', ({
    assert,
  }) => {
    const messages = Array.from({ length: 10 }, (_, index) => ({
      role: 'user' as const,
      content: `message-${index}`,
      timestamp: index,
    }))

    const transformed = trimPiContextToTokenBudget(messages, 12)

    assert.isBelow(transformed.length, messages.length)
    assert.equal((transformed.at(-1) as { content: string }).content, 'message-9')
    assert.equal(messages.length, 10)
  })

  test('stops after terminal Pi tool results', ({ assert }) => {
    const message = { stopReason: 'stop' } as never
    assert.isTrue(
      shouldStopPiAfterTurn({
        message,
        toolResults: [{ details: { kind: 'confirmation' } } as never],
      })
    )
    assert.isFalse(shouldStopPiAfterTurn({ message, toolResults: [] }))
  })

  test('keeps the agent running after a recoverable read error', ({ assert }) => {
    const shouldStop = shouldStopPiAfterTurn(
      {
        message: { stopReason: 'stop' } as never,
        toolResults: [
          {
            toolName: 'run_registered_query',
            details: { kind: 'query_error', code: 'failed' },
          } as never,
        ],
      },
      false
    )

    assert.isFalse(shouldStop)
  })

  test('stops on permission denial or after the read error budget is exhausted', ({ assert }) => {
    const message = { stopReason: 'stop' } as never
    assert.isTrue(
      shouldStopPiAfterTurn({
        message,
        toolResults: [
          {
            toolName: 'run_registered_query',
            details: { kind: 'query_error', code: 'permission_denied' },
          } as never,
        ],
      })
    )
    assert.isTrue(shouldStopPiAfterTurn({ message, toolResults: [] }, false, true))
  })
})
