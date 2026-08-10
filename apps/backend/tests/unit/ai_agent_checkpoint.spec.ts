import { test } from '@japa/runner'

import { type AiAgentRunStage, getAiAgentCheckpointConfig } from '#services/ai_agent_checkpoint'
import { createAiAgentMiddleware } from '#services/ai_agent_runtime'
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

  test('registers a checkpointed run-state graph node', ({ assert }) => {
    const middleware = createAiAgentMiddleware()
    const runState = middleware.find((item) => item.name === 'ai_agent_run_state')
    const summaryBoundary = middleware.find((item) => item.name === 'ai_agent_summary_boundary')

    assert.exists(runState)
    assert.isFunction(runState?.beforeAgent)
    assert.isFunction(runState?.beforeModel)
    assert.isFunction(runState?.afterModel)
    assert.isFunction(runState?.afterAgent)
    assert.exists(summaryBoundary)
    assert.isFunction(summaryBoundary?.beforeModel)
  })

  test('defines the persisted run stages used by explicit resume', ({ assert }) => {
    const stages: AiAgentRunStage[] = ['running', 'model_running', 'tool_pending', 'completed']
    assert.deepEqual(stages, ['running', 'model_running', 'tool_pending', 'completed'])
  })
})
