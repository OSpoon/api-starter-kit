import { test } from '@japa/runner'

import { getAiAgentCheckpointConfig } from '#services/ai_agent_checkpoint'
import { selectAiAgentInvocationMessages } from '#services/ai_agent_service'
import { shouldPreserveAiAgentCheckpoint } from '#services/ai_chat_turn_service'

test.group('AI agent checkpoint state', () => {
  test('scopes the LangGraph thread to both the user and conversation', ({ assert }) => {
    assert.deepEqual(getAiAgentCheckpointConfig({ userId: 7, conversationId: 19 }), {
      configurable: { thread_id: 'ai-chat:7:19' },
    })
  })

  test('bootstraps an empty thread with history and resumes with only the new turn', ({
    assert,
  }) => {
    const messages = [
      { role: 'user' as const, content: 'first question' },
      { role: 'assistant' as const, content: 'first answer' },
      { role: 'user' as const, content: 'second question' },
    ]

    assert.deepEqual(selectAiAgentInvocationMessages({ messages, hasCheckpoint: false }), messages)
    assert.deepEqual(selectAiAgentInvocationMessages({ messages, hasCheckpoint: true }), [
      messages[2],
    ])
  })

  test('treats the checkpoint as the primary source for resumed context', ({ assert }) => {
    const messages = [{ role: 'user' as const, content: 'latest question' }]

    assert.deepEqual(selectAiAgentInvocationMessages({ messages, hasCheckpoint: true }), messages)
  })

  test('preserves checkpoint state for an aborted run but clears it for other failures', ({
    assert,
  }) => {
    assert.isTrue(shouldPreserveAiAgentCheckpoint(new DOMException('cancelled', 'AbortError')))
    assert.isFalse(shouldPreserveAiAgentCheckpoint(new Error('provider failed')))
  })
})
