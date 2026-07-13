import { test } from '@japa/runner'

import { buildAiChatContext, estimateAiChatTokens } from '#services/ai_chat_context_service'

const messages = [
  { id: 1, role: 'user' as const, content: 'We need to add a notification setting.' },
  {
    id: 2,
    role: 'assistant' as const,
    content: 'I will add the setting and preserve the current permissions.',
  },
  { id: 3, role: 'user' as const, content: 'Keep the setting disabled by default.' },
  { id: 4, role: 'assistant' as const, content: 'The default will remain disabled.' },
  { id: 5, role: 'user' as const, content: 'What is left to verify?' },
]

test.group('AI chat context compression', () => {
  test('estimates text conservatively for context budgeting', ({ assert }) => {
    assert.equal(estimateAiChatTokens(''), 1)
    assert.equal(estimateAiChatTokens('abcd'), 2)
  })

  test('summarizes older messages and retains the configured recent window', async ({ assert }) => {
    let summaryInput: string | null = null
    const result = await buildAiChatContext(
      messages,
      { summary: null, summaryUntilMessageId: null },
      {
        enabled: true,
        thresholdTokens: 1_000,
        historyMessageLimit: 4,
        recentMessageCount: 2,
        summarize: async ({ messages: messagesToSummarize }) => {
          summaryInput = messagesToSummarize.map((message) => message.content).join(' ')
          return 'Notification setting should remain disabled by default.'
        },
      }
    )

    assert.isTrue(result.didCompress)
    assert.equal(
      summaryInput,
      messages
        .slice(0, 3)
        .map((message) => message.content)
        .join(' ')
    )
    assert.deepEqual(result.state, {
      summary: 'Notification setting should remain disabled by default.',
      summaryUntilMessageId: 3,
    })
    assert.deepEqual(
      result.messages.map((message) => message.role),
      ['system', 'assistant', 'user']
    )
    assert.deepEqual(
      result.messages.slice(1).map((message) => message.content),
      [messages[3].content, messages[4].content]
    )
  })

  test('keeps the existing summary and falls back to the recent message window when summarization fails', async ({
    assert,
  }) => {
    const result = await buildAiChatContext(
      messages,
      { summary: 'Existing decision: settings default to disabled.', summaryUntilMessageId: 1 },
      {
        enabled: true,
        thresholdTokens: 1,
        historyMessageLimit: 2,
        recentMessageCount: 1,
        summarize: async () => {
          throw new Error('provider unavailable')
        },
      }
    )

    assert.isFalse(result.didCompress)
    assert.equal(result.state.summaryUntilMessageId, 1)
    assert.deepEqual(
      result.messages.map((message) => message.role),
      ['system', 'assistant', 'user']
    )
    assert.deepEqual(
      result.messages.slice(1).map((message) => message.content),
      [messages[3].content, messages[4].content]
    )
  })
})
