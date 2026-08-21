import { test } from '@japa/runner'

import { resolveAiChatRegeneration } from '#ai/chat/ai_chat_regeneration'

const messages = [
  { id: 1, role: 'user' as const, content: 'What can I change?' },
  { id: 2, role: 'assistant' as const, content: 'You can update your profile.' },
  { id: 3, role: 'user' as const, content: 'Please explain permissions.' },
  { id: 4, role: 'assistant' as const, content: 'Permissions are role based.' },
]

test.group('AI chat regeneration', () => {
  test('replaces only the final assistant response while retaining its user message', ({
    assert,
  }) => {
    const result = resolveAiChatRegeneration(messages, 4)

    assert.deepEqual(result?.userMessage, messages[2])
    assert.deepEqual(result?.messages, messages.slice(0, -1))
  })

  test('rejects regeneration of an earlier turn', ({ assert }) => {
    assert.isNull(resolveAiChatRegeneration(messages, 2))
  })
})
