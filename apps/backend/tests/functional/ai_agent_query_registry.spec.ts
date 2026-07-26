import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import AiAgentPendingQuery from '#models/ai_agent_pending_query'
import AiChatConversation from '#models/ai_chat_conversation'
import AuditLog from '#models/audit_log'
import Role from '#models/role'
import User from '#models/user'
import { getPendingAiQueryContext, runRegisteredAiQuery } from '#services/ai_agent_query_registry'
import { generateInitialPassword } from '#services/user_credentials'

async function createAdminConversation() {
  const role = await Role.findByOrFail('code', 'super-admin')
  const user = await User.create({
    fullName: 'Query Administrator',
    email: `query-admin-${Date.now()}@example.com`,
    password: generateInitialPassword(),
  })
  await user.related('roles').sync([role.id])
  const conversation = await AiChatConversation.create({ userId: user.id, title: 'Query test' })
  return { user, conversation }
}

test.group('AI agent registered queries', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('persists only the missing required parameters until a later reply completes the query', async ({
    assert,
  }) => {
    const { user, conversation } = await createAdminConversation()
    const target = await User.create({
      fullName: 'Sensitive Target',
      email: `sensitive-target-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })

    const waiting = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'managed_user_profile',
      params: {},
    })

    assert.deepEqual(waiting, {
      kind: 'missing_parameters',
      templateCode: 'managed_user_profile',
      missingFields: [{ name: 'userId', description: 'Required positive managed-user ID.' }],
    })
    const pending = await AiAgentPendingQuery.query()
      .where('conversation_id', conversation.id)
      .firstOrFail()
    assert.equal(pending.status, 'collecting_parameters')
    assert.deepEqual(pending.missingFields, ['userId'])
    assert.include(
      await getPendingAiQueryContext({ conversationId: conversation.id, userId: user.id }),
      'managed_user_profile'
    )

    const completed = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'managed_user_profile',
      params: { userId: String(target.id) },
    })

    assert.equal(completed.kind, 'query_result')
    if (completed.kind !== 'query_result') {
      throw new Error('Expected completed registered query result')
    }
    assert.equal(completed.templateCode, 'managed_user_profile')
    assert.deepEqual(completed.rows, [
      {
        id: target.id,
        fullName: 'S*',
        email: `s***@example.com`,
        twoFactorEnabled: false,
        disabled: false,
        roles: [],
      },
    ])
    await pending.refresh()
    assert.equal(pending.status, 'executed')
    assert.deepEqual(pending.missingFields, [])
    const audit = await AuditLog.query()
      .where('action', 'agent.query_executed')
      .where('target_id', 'managed_user_profile')
      .orderBy('id', 'desc')
      .firstOrFail()
    assert.deepEqual(
      {
        templateVersion: audit.metadata?.templateVersion,
        parameterNames: audit.metadata?.parameterNames,
        resultCount: audit.metadata?.resultCount,
        authorization: audit.metadata?.authorization,
      },
      {
        templateVersion: 1,
        parameterNames: ['userId'],
        resultCount: 1,
        authorization: 'allowed',
      }
    )
    assert.isNumber(audit.metadata?.durationMs)
  })

  test('rejects unknown parameters without persisting them', async ({ assert }) => {
    const { user, conversation } = await createAdminConversation()

    const result = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'managed_user_profile',
      params: { userId: 1, sql: 'select * from users' },
    })

    assert.deepEqual(result, { kind: 'query_error', message: '不支持的查询参数：sql' })
    assert.isNull(
      await AiAgentPendingQuery.query().where('conversation_id', conversation.id).first()
    )
  })

  test('denies an unprivileged user before creating pending query state', async ({ assert }) => {
    const user = await User.create({
      fullName: 'Query Reader',
      email: `query-reader-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const conversation = await AiChatConversation.create({ userId: user.id, title: 'Denied query' })

    await assert.rejects(
      () =>
        runRegisteredAiQuery({
          conversationId: conversation.id,
          userId: user.id,
          templateCode: 'managed_user_profile',
          params: {},
        }),
      '当前账号没有执行此查询的权限'
    )
    assert.isNull(
      await AiAgentPendingQuery.query().where('conversation_id', conversation.id).first()
    )
  })
})
