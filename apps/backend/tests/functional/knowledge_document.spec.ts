import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import KnowledgeDocument from '#models/knowledge_document'
import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'

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

  test('searches knowledge documents on the server before pagination', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Knowledge search admin',
      email: `knowledge-search-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(user)

    const searchId = String(Date.now())
    const matchedDocument = await KnowledgeDocument.create({
      title: `Searchable ${searchId}`,
      content: 'Matching body content',
      summary: null,
      topics: [],
      contentHash: `${searchId}a`.slice(0, 64),
    })
    await KnowledgeDocument.create({
      title: 'Unrelated document',
      content: 'Different document',
      summary: null,
      topics: [],
      contentHash: `${searchId}b`.slice(0, 64),
    })

    const response = await client
      .get(`/api/v1/system/knowledge-documents?search=${searchId}&page=1&limit=1`)
      .bearerToken(token.value!.release())

    response.assertStatus(200)
    const body = response.body().data as {
      items: Array<{ id: number; title: string }>
      meta: { total: number }
    }
    assert.deepEqual(
      body.items.map((item) => item.id),
      [matchedDocument.id]
    )
    assert.equal(body.meta.total, 1)
  })
})
