import { test } from '@japa/runner'

import { createAiAgentInputMessages, createAiAgentThreadId } from '#services/ai_agent_state'

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
})
