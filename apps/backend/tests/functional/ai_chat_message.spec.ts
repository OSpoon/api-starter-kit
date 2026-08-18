import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage from '#models/ai_chat_message'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'

test.group('AI chat messages', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('stores citations with quoted knowledge excerpts as JSON', async ({ assert }) => {
    const user = await User.create({
      fullName: 'AI Chat User',
      email: `ai-chat-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Knowledge question',
    })
    const citations = [
      {
        documentId: 1,
        chunkId: 2,
        title: 'README',
        excerpt: '菜单与面包屑均来自路由 `meta` 定义，包含“引用”。',
      },
    ]

    const message = await AiChatMessage.create({
      conversationId: conversation.id,
      role: 'assistant',
      content: '请参考 README。',
      citations,
    })
    const persistedMessage = await AiChatMessage.findOrFail(message.id)

    assert.deepEqual(persistedMessage.citations, citations)
  })

  test('stores sanitized runtime details for historical assistant messages', async ({ assert }) => {
    const user = await User.create({
      fullName: 'AI Runtime User',
      email: `ai-runtime-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const conversation = await AiChatConversation.create({
      userId: user.id,
      title: 'Runtime details',
    })
    const runtimeDetails = [
      {
        kind: 'tool' as const,
        name: 'run_registered_query',
        state: 'done' as const,
        callId: 'call-1',
        durationMs: 23,
        detail: { resultCount: 1 },
      },
    ]

    const message = await AiChatMessage.create({
      conversationId: conversation.id,
      role: 'assistant',
      content: '查询完成。',
      runtimeDetails,
    })
    const persistedMessage = await AiChatMessage.findOrFail(message.id)

    assert.deepEqual(persistedMessage.runtimeDetails, runtimeDetails)
  })
})
