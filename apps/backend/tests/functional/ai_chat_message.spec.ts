import { readFile } from 'node:fs/promises'

import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { test } from '@japa/runner'

import AiChatConversation from '#models/ai_chat_conversation'
import AiChatMessage from '#models/ai_chat_message'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'
import {
  createAiChatPdfMessage,
  listAiChatPdfAttachments,
  readAiChatPdf,
} from '#services/ai_chat_pdf_service'
import { updateMineruToken } from '#services/mineru_configuration_service'
import { serializeAiChatMessage } from '#transformers/ai_chat_transformer'

test.group('AI chat messages', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('uses MinerU only for authorized PDF reads and reuses cached text in the same conversation', async ({
    assert,
  }) => {
    const user = await User.create({
      fullName: 'PDF attachment test',
      email: `ai-pdf-${crypto.randomUUID()}@example.com`,
      password: generateInitialPassword(),
    })
    const conversation = await AiChatConversation.create({ userId: user.id, title: 'PDF' })
    const pdf = Buffer.from('%PDF-1.7 test')
    const attachment = await createAiChatPdfMessage(conversation.id, 'Read this', 'test.pdf', pdf)
    const scope = { conversationId: conversation.id, userId: user.id }
    const archive = await readFile(new URL('../fixtures/mineru/pdf-result.zip', import.meta.url))
    const originalFetch = globalThis.fetch
    const requests: string[] = []
    let failFirstPoll = true
    await updateMineruToken('test-token')

    globalThis.fetch = async (url, options) => {
      const address = new URL(String(url))
      const headers = new Headers(options?.headers)
      requests.push(address.hostname)
      if (address.pathname === '/api/v4/file-urls/batch') {
        assert.equal(headers.get('Authorization'), 'Bearer test-token')
        assert.include(String(options?.body), 'attachment.pdf')
        return Response.json({
          code: 0,
          data: {
            batch_id: 'test-batch',
            file_urls: ['https://mineru.oss-cn-shanghai.aliyuncs.com/fixture'],
          },
        })
      }
      if (address.hostname === 'mineru.oss-cn-shanghai.aliyuncs.com') {
        assert.equal(options?.method, 'PUT')
        assert.isFalse(headers.has('Authorization'))
        assert.deepEqual(Buffer.from(options?.body as Uint8Array), pdf)
        return new Response(null)
      }
      if (address.pathname === '/api/v4/extract-results/batch/test-batch') {
        assert.equal(headers.get('Authorization'), 'Bearer test-token')
        if (failFirstPoll) {
          failFirstPoll = false
          return new Response(null, { status: 503 })
        }
        return Response.json({
          code: 0,
          data: {
            extract_result: [
              {
                data_id: String(attachment.id),
                state: 'done',
                full_zip_url: 'https://cdn-mineru.openxlab.org.cn/fixture.zip',
              },
            ],
          },
        })
      }
      assert.equal(address.hostname, 'cdn-mineru.openxlab.org.cn')
      assert.isFalse(headers.has('Authorization'))
      return new Response(new Uint8Array(archive))
    }

    try {
      assert.deepEqual(serializeAiChatMessage(attachment).pdf, { name: 'test.pdf' })
      assert.deepEqual(await listAiChatPdfAttachments(conversation.id, user.id), [
        { attachmentId: attachment.id, name: 'test.pdf' },
      ])
      await assert.rejects(() =>
        readAiChatPdf({ ...scope, conversationId: conversation.id + 1 }, attachment.id, 0)
      )
      await assert.rejects(() => readAiChatPdf({ ...scope, userId: user.id + 1 }, attachment.id, 0))
      assert.lengthOf(requests, 0)
      await assert.rejects(() => readAiChatPdf(scope, attachment.id, 0))
      assert.lengthOf(requests, 3)
      await updateMineruToken('rotated-web-token')
      const result = await readAiChatPdf(scope, attachment.id, 0)
      assert.equal(result.state, 'ready')
      if (result.state !== 'ready') throw new Error('Expected parsed PDF')
      assert.isTrue(result.markdown.startsWith('# Example PDF'))
      assert.equal(result.markdown.length, 6000)
      assert.equal(result.nextOffset, 6000)
      const batch = await db
        .from('ai_chat_pdf_attachments')
        .where('message_id', attachment.id)
        .first()
      assert.isNull(batch.batch_token)
      assert.lengthOf(requests, 5)
      const cached = await readAiChatPdf(scope, attachment.id, 6000)
      assert.equal(cached.state, 'ready')
      assert.lengthOf(requests, 5)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('rejects PDF uploads without explicit MinerU consent', async ({ client }) => {
    const user = await User.create({
      fullName: 'PDF consent test',
      email: `pdf-consent-${crypto.randomUUID()}@example.com`,
      password: generateInitialPassword(),
    })
    const conversation = await AiChatConversation.create({ userId: user.id, title: 'PDF' })
    const token = await User.accessTokens.create(user)
    const path = `/api/v1/ai-chat/conversations/${conversation.id}/messages`
    const response = await client
      .post(path)
      .bearerToken(token.value!.release())
      .file('pdf', Buffer.from('%PDF-1.7 test'), {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      })
    response.assertStatus(422)
  })

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
        kind: 'model_text' as const,
        callId: 'model-response-1',
        text: '正在检查工具结果。',
      },
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
        name: 'model_response' as const,
        state: 'done' as const,
        callId: 'model-response-1',
        startedAt: 1_760_000_000_000,
        durationMs: 1_200,
        outcome: 'final_response' as const,
      },
      {
        kind: 'plan' as const,
        steps: [
          {
            key: 'identify_target',
            state: 'done' as const,
            startedAt: 1_760_000_000_000,
            durationMs: 800,
          },
        ],
      },
      {
        kind: 'run' as const,
        state: 'error' as const,
        durationMs: 1_500,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          modelCalls: 2,
          totalTokens: 120,
          compactionCalls: 1,
        },
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
