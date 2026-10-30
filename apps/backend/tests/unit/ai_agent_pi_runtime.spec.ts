import { estimateContextTokens, estimateMessageTokens } from '@earendil-works/pi-ai/utils/estimate'
import { test } from '@japa/runner'

import {
  buildAiAgentSummaryBatch,
  type PiAgentMessage,
  shouldStopPiAfterTurn,
  trimPiContextToTokenBudget,
} from '#ai/runtime/ai_agent_pi_runtime'

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

  test('bounds summary input and advances only through included source messages', ({ assert }) => {
    const messages: PiAgentMessage[] = [
      { role: 'user', content: 'history '.repeat(1000), timestamp: 0, sourceMessageId: 12 },
      { role: 'user', content: 'later history', timestamp: 0, sourceMessageId: 13 },
    ]

    const batch = buildAiAgentSummaryBatch(messages, 'prior summary', 120)

    assert.isDefined(batch)
    assert.isAtMost(
      estimateMessageTokens({ role: 'user', content: batch!.content, timestamp: 0 }),
      120
    )
    assert.equal(batch!.coveredThroughMessageId, 12)
    assert.notInclude(batch!.content, 'later history')
  })

  test('keeps an oversized latest user message within the model budget without changing history', ({
    assert,
  }) => {
    const original = {
      role: 'user' as const,
      content: 'long prompt '.repeat(2000),
      timestamp: 0,
    }

    const transformed = trimPiContextToTokenBudget([original], 40)

    assert.isAtMost(estimateContextTokens(transformed as never).tokens, 40)
    assert.isBelow((transformed[0] as { content: string }).content.length, original.content.length)
    assert.equal(original.content.length, 'long prompt '.repeat(2000).length)
  })

  test('stops after terminal Pi tool results', ({ assert }) => {
    const message = {
      stopReason: 'stop',
      content: [{ type: 'text', text: '请在确认卡中确认后执行。' }],
    } as never
    assert.isTrue(
      shouldStopPiAfterTurn({
        message,
        toolResults: [{ details: { kind: 'action_error' } } as never],
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
