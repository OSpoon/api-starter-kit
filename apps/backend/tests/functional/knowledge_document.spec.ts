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
    assert.isTrue(reloaded.enabled)
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

  test('limits document visibility to assigned roles while managers can see all', async ({
    client,
    assert,
  }) => {
    const readPermission = await Permission.findByOrFail('code', 'knowledge:read')
    const managePermission = await Permission.findByOrFail('code', 'knowledge:manage')
    const allowedRole = await Role.create({
      code: `knowledge-allowed-${Date.now()}`,
      name: 'Allowed',
    })
    const otherRole = await Role.create({ code: `knowledge-other-${Date.now()}`, name: 'Other' })
    const managerRole = await Role.create({
      code: `knowledge-manager-${Date.now()}`,
      name: 'Manager',
    })
    await allowedRole.related('permissions').sync([readPermission.id])
    await managerRole.related('permissions').sync([readPermission.id, managePermission.id])

    const suffix = `${Date.now()}`
    const publicDocument = await KnowledgeDocument.create({
      title: `Public ${suffix}`,
      content: 'Visible to all readers',
      contentHash: `${suffix}a`.slice(0, 64),
      topics: [],
    })
    const allowedDocument = await KnowledgeDocument.create({
      title: `Allowed ${suffix}`,
      content: 'Visible to the matching role',
      contentHash: `${suffix}b`.slice(0, 64),
      topics: [],
    })
    await allowedDocument.related('roles').sync([allowedRole.id])
    const hiddenDocument = await KnowledgeDocument.create({
      title: `Restricted ${suffix}`,
      content: 'Visible to another role',
      contentHash: `${suffix}c`.slice(0, 64),
      topics: [],
    })
    await hiddenDocument.related('roles').sync([otherRole.id])

    const reader = await User.create({
      fullName: 'Role-scoped knowledge reader',
      email: `knowledge-scoped-${suffix}@example.com`,
      password: generateInitialPassword(),
    })
    await reader.related('roles').sync([allowedRole.id])
    const readerToken = await User.accessTokens.create(reader)
    const readerResponse = await client
      .get(`/api/v1/system/knowledge-documents?search=${suffix}`)
      .bearerToken(readerToken.value!.release())
    readerResponse.assertStatus(200)
    const readerTitles = (
      readerResponse.body().data as { items: Array<{ title: string }> }
    ).items.map((document) => document.title)
    assert.includeMembers(readerTitles, [publicDocument.title, allowedDocument.title])
    assert.notInclude(readerTitles, hiddenDocument.title)

    const manager = await User.create({
      fullName: 'Knowledge manager',
      email: `knowledge-manager-${suffix}@example.com`,
      password: generateInitialPassword(),
    })
    await manager.related('roles').sync([managerRole.id])
    const managerToken = await User.accessTokens.create(manager)
    const managerResponse = await client
      .get(`/api/v1/system/knowledge-documents?search=${suffix}`)
      .bearerToken(managerToken.value!.release())
    managerResponse.assertStatus(200)
    const managerTitles = (
      managerResponse.body().data as { items: Array<{ title: string }> }
    ).items.map((document) => document.title)
    assert.includeMembers(managerTitles, [
      publicDocument.title,
      allowedDocument.title,
      hiddenDocument.title,
    ])
  })

  test('lists disabled documents with their enabled state and role access data', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Knowledge document status admin',
      email: `knowledge-status-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(user)
    const document = await KnowledgeDocument.create({
      title: `Disabled document ${Date.now()}`,
      content: 'This document is disabled for assistant retrieval.',
      contentHash: `${Date.now()}c`.slice(0, 64),
      topics: [],
      enabled: false,
    })

    const response = await client
      .get(`/api/v1/system/knowledge-documents?search=${encodeURIComponent(document.title)}`)
      .bearerToken(token.value!.release())
    response.assertStatus(200)
    const items = (response.body().data as { items: Array<Record<string, unknown>> }).items
    const listed = items.find((item) => item.id === document.id)
    assert.exists(listed)
    assert.isFalse(listed!.enabled)
    assert.deepEqual(listed!.roles, [])
  })
})
