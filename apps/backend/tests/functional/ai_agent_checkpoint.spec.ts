import { test } from '@japa/runner'

import { clearAiAgentCheckpoint, hasAiAgentCheckpoint } from '#services/ai_agent_checkpoint'

test.group('AI agent checkpoint persistence', () => {
  test('can inspect and clear an isolated LangGraph thread', async ({ assert }) => {
    const thread = { conversationId: 9_999_999, userId: 9_999_999 }

    await clearAiAgentCheckpoint(thread)
    assert.isFalse(await hasAiAgentCheckpoint(thread))
  })
})
