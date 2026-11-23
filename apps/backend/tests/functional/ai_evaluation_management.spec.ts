import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import AiChatConversation from '#models/ai_chat_conversation'
import AiEvaluationCase from '#models/ai_evaluation_case'
import AiEvaluationRun from '#models/ai_evaluation_run'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'

async function createUserWithPermissions(permissionCodes: string[], label: string) {
  const permissions = await Permission.query().whereIn('code', permissionCodes)
  const role = await Role.create({ code: `evaluation-${label}-${Date.now()}`, name: label })
  await role.related('permissions').sync(permissions.map((permission) => permission.id))
  const user = await User.create({
    fullName: `Evaluation ${label}`,
    email: `evaluation-${label}-${crypto.randomUUID()}@example.com`,
    password: generateInitialPassword(),
  })
  await user.related('roles').sync([role.id])
  const token = await User.accessTokens.create(user)
  return { user, token: token.value!.release() }
}

test.group('AI evaluation management', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('allows a reader to list and a manager to create, while denying missing permissions', async ({
    client,
    assert,
  }) => {
    const reader = await createUserWithPermissions(['ai-evaluations:read'], 'reader')
    const list = await client.get('/api/v1/system/ai-evaluations').bearerToken(reader.token)
    list.assertStatus(200)
    assert.isArray((list.body() as unknown as { data: { items: unknown[] } }).data.items)

    const deniedWrite = await client
      .post('/api/v1/system/ai-evaluations')
      .bearerToken(reader.token)
      .json({ name: 'Denied', question: 'Q', referenceAnswer: 'A' })
    deniedWrite.assertStatus(403)

    const deniedChatImport = await client
      .post('/api/v1/system/ai-evaluations/import-conversation')
      .bearerToken(reader.token)
      .json({ conversationId: 1, messageIds: [1, 2] })
    deniedChatImport.assertStatus(403)

    const manager = await createUserWithPermissions(
      ['ai-evaluations:read', 'ai-evaluations:manage'],
      'manager'
    )
    const created = await client
      .post('/api/v1/system/ai-evaluations')
      .bearerToken(manager.token)
      .json({
        name: 'Read a log',
        question: '查一下日志。',
        referenceAnswer: '日志读取会返回模拟数据。',
        requiredTerms: ['模拟'],
      })
    created.assertStatus(200)
    const createdCase = (created.body() as unknown as { data: { id: number; name: string } }).data
    assert.equal(createdCase.name, 'Read a log')

    const listed = await client.get('/api/v1/system/ai-evaluations').bearerToken(manager.token)
    listed.assertStatus(200)
    const listedItems = (listed.body() as unknown as { data: { items: Array<{ id: number }> } })
      .data.items
    assert.isTrue(listedItems.some(({ id }) => id === createdCase.id))
  })

  test('imports selected owned chat messages as one redacted multi-turn evaluation', async ({
    client,
    assert,
  }) => {
    const owner = await createUserWithPermissions(
      ['ai-evaluations:read', 'ai-evaluations:manage'],
      'chat-owner'
    )
    const other = await createUserWithPermissions(
      ['ai-evaluations:read', 'ai-evaluations:manage'],
      'other-owner'
    )
    const ownConversation = await AiChatConversation.create({
      userId: owner.user.id,
      title: 'Own chat',
    })
    const otherConversation = await AiChatConversation.create({
      userId: other.user.id,
      title: 'Other chat',
    })
    const ownMessages = await ownConversation.related('messages').createMany([
      { role: 'user', content: '联系 person@example.com 查日志。' },
      { role: 'assistant', content: '手机号 13800138000 已脱敏。' },
      { role: 'user', content: '再查一次最近日志。' },
      { role: 'assistant', content: '最近日志暂时没有异常。' },
    ])
    const otherMessages = await otherConversation.related('messages').createMany([
      { role: 'user', content: 'private question' },
      { role: 'assistant', content: 'private answer' },
    ])

    const response = await client
      .post('/api/v1/system/ai-evaluations/import-conversation')
      .bearerToken(owner.token)
      .json({ conversationId: ownConversation.id, messageIds: ownMessages.map(({ id }) => id) })
    response.assertStatus(200)
    const imported = (
      response.body() as unknown as {
        data: { id: number; question: string; referenceAnswer: string }
      }
    ).data
    assert.include(imported.question, '[已脱敏邮箱]')
    assert.notInclude(imported.question, 'person@example.com')
    assert.notInclude(imported.referenceAnswer, '13800138000')

    const savedCase = await AiEvaluationCase.findOrFail(imported.id)
    assert.deepEqual(
      savedCase.sourceMessageIds,
      ownMessages.map(({ id }) => id)
    )
    assert.lengthOf(savedCase.conversationMessages, 4)
    assert.notInclude(JSON.stringify(savedCase.conversationMessages), 'person@example.com')
    assert.notInclude(JSON.stringify(savedCase.conversationMessages), '13800138000')

    const duplicateImport = await client
      .post('/api/v1/system/ai-evaluations/import-conversation')
      .bearerToken(owner.token)
      .json({ conversationId: ownConversation.id, messageIds: ownMessages.map(({ id }) => id) })
    duplicateImport.assertStatus(200)
    assert.equal(
      (duplicateImport.body() as unknown as { data: { id: number } }).data.id,
      imported.id
    )

    const crossConversation = await client
      .post('/api/v1/system/ai-evaluations/import-conversation')
      .bearerToken(owner.token)
      .json({ conversationId: ownConversation.id, messageIds: otherMessages.map(({ id }) => id) })
    crossConversation.assertStatus(422)

    const otherOwnerChat = await client
      .post('/api/v1/system/ai-evaluations/import-conversation')
      .bearerToken(owner.token)
      .json({ conversationId: otherConversation.id, messageIds: otherMessages.map(({ id }) => id) })
    otherOwnerChat.assertStatus(404)
  })

  test('searches names and questions independently and filters by source', async ({
    client,
    assert,
  }) => {
    const owner = await createUserWithPermissions(['ai-evaluations:read'], 'source-search')
    const conversation = await AiChatConversation.create({
      userId: owner.user.id,
      title: 'Imported evaluation source',
    })
    const chatCase = await AiEvaluationCase.create({
      sourceConversationId: conversation.id,
      name: 'Imported source case',
      question: 'unique imported question phrase',
      referenceAnswer: 'Reference answer',
      expectedTools: [],
      expectedToolSequence: [],
      requiredTerms: [],
      forbiddenTerms: [],
      mockToolOutputs: {},
    })
    const manualCase = await AiEvaluationCase.create({
      sourceConversationId: null,
      name: 'Manual source case',
      question: 'unique manual question phrase',
      referenceAnswer: 'Reference answer',
      expectedTools: [],
      expectedToolSequence: [],
      requiredTerms: [],
      forbiddenTerms: [],
      mockToolOutputs: {},
    })

    const questionSearch = await client
      .get('/api/v1/system/ai-evaluations?question=unique%20imported%20question')
      .bearerToken(owner.token)
    questionSearch.assertStatus(200)
    const searchItems = (
      questionSearch.body() as unknown as {
        data: { items: Array<{ id: number; sourceConversationId: number | null }> }
      }
    ).data.items
    assert.isTrue(searchItems.some(({ id }) => id === chatCase.id))

    const nameSearch = await client
      .get('/api/v1/system/ai-evaluations?name=Imported%20source%20case')
      .bearerToken(owner.token)
    nameSearch.assertStatus(200)
    const nameItems = (nameSearch.body() as unknown as { data: { items: Array<{ id: number }> } })
      .data.items
    assert.isTrue(nameItems.some(({ id }) => id === chatCase.id))

    const combinedSearch = await client
      .get(
        '/api/v1/system/ai-evaluations?name=Imported%20source%20case&question=unique%20manual%20question'
      )
      .bearerToken(owner.token)
    combinedSearch.assertStatus(200)
    assert.isEmpty(
      (combinedSearch.body() as unknown as { data: { items: Array<{ id: number }> } }).data.items
    )

    const chatSource = await client
      .get('/api/v1/system/ai-evaluations?source=chat')
      .bearerToken(owner.token)
    chatSource.assertStatus(200)
    const chatItems = (
      chatSource.body() as unknown as {
        data: { items: Array<{ id: number; sourceConversationId: number | null }> }
      }
    ).data.items
    assert.isTrue(chatItems.some(({ id }) => id === chatCase.id))
    assert.isTrue(chatItems.every(({ sourceConversationId }) => sourceConversationId !== null))

    const manualSource = await client
      .get('/api/v1/system/ai-evaluations?source=manual')
      .bearerToken(owner.token)
    manualSource.assertStatus(200)
    const manualItems = (
      manualSource.body() as unknown as {
        data: { items: Array<{ id: number; sourceConversationId: number | null }> }
      }
    ).data.items
    assert.isTrue(manualItems.some(({ id }) => id === manualCase.id))
    assert.isTrue(manualItems.every(({ sourceConversationId }) => sourceConversationId === null))

    const invalidSource = await client
      .get('/api/v1/system/ai-evaluations?source=unknown')
      .bearerToken(owner.token)
    invalidSource.assertStatus(422)
  })

  test('requires the run permission before validating a run request', async ({ client }) => {
    const reader = await createUserWithPermissions(['ai-evaluations:read'], 'run-denied')
    const denied = await client
      .post('/api/v1/system/ai-evaluations/runs')
      .bearerToken(reader.token)
      .json({})
    denied.assertStatus(403)

    const runner = await createUserWithPermissions(
      ['ai-evaluations:read', 'ai-evaluations:run'],
      'runner'
    )
    const allowed = await client
      .post('/api/v1/system/ai-evaluations/runs')
      .bearerToken(runner.token)
      .json({ caseIds: [999_999] })
    allowed.assertStatus(422)
  })

  test('persists evaluation run JSONB arrays as JSON and exposes per-case history', async ({
    assert,
    client,
  }) => {
    const owner = await createUserWithPermissions(
      ['ai-evaluations:read', 'ai-evaluations:run'],
      'run-json'
    )
    const evaluationCase = await AiEvaluationCase.create({
      name: 'JSONB case',
      question: 'Question',
      referenceAnswer: 'Reference',
      expectedTools: [],
      expectedToolSequence: [],
      requiredTerms: [],
      forbiddenTerms: [],
      mockToolOutputs: {},
    })
    const expectedResult = {
      caseId: evaluationCase.id,
      caseName: 'JSONB case',
      question: 'Question',
      referenceAnswer: 'Reference',
      actualAnswer: 'Actual',
      expectedTools: [],
      actualTools: [],
      toolsPassed: true,
      referenceSimilarity: 100,
      requiredTerms: [],
      forbiddenTerms: [],
      score: 100,
      passed: true,
    }
    const run = await AiEvaluationRun.create({
      userId: owner.user.id,
      status: 'queued',
      modelId: 'test-model',
      totalCases: 1,
      completedCases: 0,
      caseIds: [evaluationCase.id],
      score: null,
      results: [],
      error: null,
      startedAt: null,
      completedAt: null,
    })

    run.results = [expectedResult]
    await run.save()

    const persisted = await AiEvaluationRun.findOrFail(run.id)
    assert.deepEqual(persisted.caseIds, [evaluationCase.id])
    assert.deepEqual(persisted.results, [expectedResult])

    const history = await client
      .get(`/api/v1/system/ai-evaluations/${evaluationCase.id}/history?page=1&limit=100`)
      .bearerToken(owner.token)
    history.assertStatus(200)
    const historyItems = (
      history.body() as unknown as {
        data: {
          items: Array<{
            runId: number
            modelId: string
            result: { actualAnswer: string; score: number }
          }>
          meta: { total: number }
        }
      }
    ).data
    assert.equal(historyItems.meta.total, 1)
    assert.equal(historyItems.items[0]?.runId, run.id)
    assert.equal(historyItems.items[0]?.modelId, 'test-model')
    assert.equal(historyItems.items[0]?.result.actualAnswer, 'Actual')
    assert.equal(historyItems.items[0]?.result.score, 100)

    const deniedReader = await createUserWithPermissions([], 'history-denied')
    const denied = await client
      .get(`/api/v1/system/ai-evaluations/${evaluationCase.id}/history`)
      .bearerToken(deniedReader.token)
    denied.assertStatus(403)
  })
})
