import { test } from '@japa/runner'

import {
  createAiAgentInputMessages,
  createAiAgentThreadId,
  selectAiAgentContext,
} from '#services/ai_agent_state'

test.group('AI agent state', () => {
  test('namespaces each checkpoint thread by user and conversation', ({ assert }) => {
    assert.equal(createAiAgentThreadId(12, 34), 'ai-chat:12:34')
  })

  test('seeds a new checkpoint from persisted history exactly once', ({ assert }) => {
    const history = [
      { role: 'user' as const, content: 'Show my active API keys.' },
      { role: 'assistant' as const, content: 'I can help with that.' },
    ]
    const latestMessage = { role: 'user' as const, content: 'List them now.' }

    assert.deepEqual(createAiAgentInputMessages(history, latestMessage, false), [
      ...history,
      latestMessage,
    ])
    assert.deepEqual(createAiAgentInputMessages(history, latestMessage, true), [latestMessage])
  })

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
