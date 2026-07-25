import { test } from '@japa/runner'
import { DateTime } from 'luxon'

import type AiChatMessage from '#models/ai_chat_message'
import { serializeAiChatMessage } from '#transformers/ai_chat_transformer'

test.group('AI chat transformer', () => {
  test('preserves structured knowledge citations in assistant messages', ({ assert }) => {
    const createdAt = DateTime.now()
    const message = {
      id: 1,
      conversationId: 2,
      role: 'assistant',
      content: '请参考项目部署说明。',
      citations: [
        {
          documentId: 3,
          chunkId: 4,
          title: '部署说明',
          excerpt: '使用 docker compose up -d 启动生产服务。',
        },
      ],
      createdAt,
      updatedAt: createdAt,
    } as AiChatMessage

    assert.deepEqual(serializeAiChatMessage(message).citations, message.citations)
  })
})
