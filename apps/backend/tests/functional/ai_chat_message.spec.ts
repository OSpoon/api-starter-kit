import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
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
        startedAt: 1_760_000_000_000,
        displayName: 'System data query',
        durationMs: 23,
        detail: { resultCount: 1 },
      },
      {
        kind: 'phase' as const,
        name: 'mcp_discovery' as const,
        state: 'done' as const,
        callId: 'mcp-discovery:server-1',
        startedAt: 1_760_000_000_000,
        durationMs: 11,
        serverName: 'Internal catalog',
        toolCount: 3,
        tools: [
          { name: 'list_log_services', mode: 'read' as const },
          { name: 'get_latest_log' },
          { name: 'search_logs', mode: 'confirm' as const },
        ],
      },
      {
        kind: 'phase' as const,
        name: 'model_response' as const,
        state: 'done' as const,
        callId: 'model-response-1',
        startedAt: 1_760_000_000_000,
        durationMs: 1_200,
      },
      {
        kind: 'plan' as const,
        steps: [
          {
            key: 'identify_target',
            state: 'done',
            startedAt: 1_760_000_000_000,
            durationMs: 800,
          },
        ],
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

  test('rejects persisted citations with the wrong JSON shape', async ({ assert }) => {
    const user = await User.create({
      fullName: 'Invalid Citation User',
      email: `invalid-citations-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const conversation = await AiChatConversation.create({ userId: user.id, title: 'Invalid JSON' })
    const message = await AiChatMessage.create({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'Malformed persisted data',
      citations: [],
    })
    await db
      .from('ai_chat_messages')
      .where('id', message.id)
      .update({ citations: JSON.stringify({ invalid: true }) })

    await assert.rejects(() => AiChatMessage.findOrFail(message.id), /citations/)

    await db
      .from('ai_chat_messages')
      .where('id', message.id)
      .update({ citations: JSON.stringify([]), runtime_details: JSON.stringify([null]) })

    await assert.rejects(() => AiChatMessage.findOrFail(message.id), /runtime_details/)
  })
})
