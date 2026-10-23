import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { test } from '@japa/runner'

import KnowledgeDocument from '#models/knowledge_document'
import Permission from '#models/permission'
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

  test('rejects persisted topics with a non-string entry', async ({ assert }) => {
    const document = await KnowledgeDocument.create({
      title: 'Invalid topics',
      content: 'Test invalid JSON shape.',
      contentHash: 'b'.repeat(64),
      topics: [],
    })
    await db
      .from('knowledge_documents')
      .where('id', document.id)
      .update({ topics: JSON.stringify(['valid', 12]) })

    await assert.rejects(() => KnowledgeDocument.findOrFail(document.id), /topics/)
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

  test('allows knowledge readers to list documents but denies management writes', async ({
    client,
  }) => {
    const readPermission = await Permission.findByOrFail('code', 'knowledge:read')
    const role = await Role.create({ code: `knowledge-reader-${Date.now()}`, name: 'Reader' })
    await role.related('permissions').sync([readPermission.id])
    const reader = await User.create({
      fullName: 'Knowledge reader',
      email: `knowledge-reader-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await reader.related('roles').sync([role.id])
    const readerToken = await User.accessTokens.create(reader)

    const listResponse = await client
      .get('/api/v1/system/knowledge-documents')
      .bearerToken(readerToken.value!.release())
    listResponse.assertStatus(200)

    const writeResponse = await client
      .post('/api/v1/system/knowledge-documents')
      .bearerToken(readerToken.value!.release())
      .json({})
    writeResponse.assertStatus(403)

    const denied = await User.create({
      fullName: 'No knowledge access',
      email: `knowledge-denied-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const deniedToken = await User.accessTokens.create(denied)
    const deniedResponse = await client
      .get('/api/v1/system/knowledge-documents')
      .bearerToken(deniedToken.value!.release())
    deniedResponse.assertStatus(403)
  })
})
