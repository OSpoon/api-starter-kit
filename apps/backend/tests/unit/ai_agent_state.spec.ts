import { test } from '@japa/runner'

import { selectAiAgentContext } from '#services/ai_agent_state'

test.group('AI agent state', () => {
  test('uses a persisted summary plus recent messages once context exceeds its budget', ({
    assert,
  }) => {
    const messages = Array.from({ length: 4 }, (_, index) => ({
      id: index + 1,
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: 'x'.repeat(80),
    }))

    const context = selectAiAgentContext({
      messages,
      summary: 'Earlier decisions are preserved here.',
      summaryUntilMessageId: 1,
      thresholdTokens: 30,
      recentMessageCount: 2,
    })

    assert.deepEqual(
      context.messages.map((message) => message.id),
      [3, 4]
    )
    assert.deepEqual(
      context.messagesToSummarize.map((message) => message.id),
      [2]
    )
  })
})
