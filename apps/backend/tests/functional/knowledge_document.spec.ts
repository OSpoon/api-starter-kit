import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import KnowledgeDocument from '#models/knowledge_document'

test.group('knowledge documents', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('serializes and consumes topics as JSON', async ({ assert }) => {
    const topics = ['AI 助手能力', '知识库']
    const document = await KnowledgeDocument.create({
      title: '知识库说明',
      content: '用于验证 JSONB topics 序列化。',
      contentHash: 'a'.repeat(64),
      topics,
    })

    const reloaded = await KnowledgeDocument.findOrFail(document.id)

    assert.deepEqual(reloaded.topics, topics)
  })
})
