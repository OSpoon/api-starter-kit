import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import AiAgentPendingQuery from '#models/ai_agent_pending_query'
import AiChatConversation from '#models/ai_chat_conversation'
import ApiKey from '#models/api_key'
import AuditLog from '#models/audit_log'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { getPendingAiQueryContext, runRegisteredAiQuery } from '#services/ai_agent_query_registry'
import { createAiAgentTools } from '#services/ai_agent_registry'
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

  test('exposes one registered-query tool instead of dedicated system-list tools', ({ assert }) => {
    const toolNames = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
    }).map((registeredTool) => registeredTool.name)

    assert.include(toolNames, 'run_registered_query')
    assert.notInclude(toolNames, 'list_api_keys')
    assert.notInclude(toolNames, 'list_roles')
    assert.notInclude(toolNames, 'list_permissions')
  })

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
    const pendingContext = await getPendingAiQueryContext({
      conversationId: conversation.id,
      userId: user.id,
    })
    assert.include(pendingContext, 'managed_user_profile')
    assert.include(pendingContext, '"missingRequired":["userId"]')

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
    const audit = await AuditLog.query()
      .where('action', 'agent.query_rejected')
      .where('target_id', 'managed_user_profile')
      .firstOrFail()
    assert.deepEqual(audit.metadata, {
      templateVersion: 1,
      parameterNames: ['userId', 'sql'],
      unknownParameterNames: ['sql'],
      authorization: 'allowed',
      reason: 'unsupported_parameters',
      durationMs: audit.metadata?.durationMs,
    })
    assert.isNumber(audit.metadata?.durationMs)
    assert.notProperty(audit.metadata ?? {}, 'params')
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
    const audit = await AuditLog.query()
      .where('action', 'agent.query_rejected')
      .where('target_id', 'managed_user_profile')
      .where('actor_user_id', user.id)
      .firstOrFail()
    assert.deepEqual(
      {
        templateVersion: audit.metadata?.templateVersion,
        parameterNames: audit.metadata?.parameterNames,
        authorization: audit.metadata?.authorization,
        reason: audit.metadata?.reason,
      },
      {
        templateVersion: 1,
        parameterNames: [],
        authorization: 'denied',
        reason: 'permission_denied',
      }
    )
    assert.isNumber(audit.metadata?.durationMs)
  })

  test('audits invalid query parameters without retaining parameter values', async ({ assert }) => {
    const { user, conversation } = await createAdminConversation()

    const result = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'managed_user_profile',
      params: { userId: 'not-an-id' },
    })

    assert.equal(result.kind, 'query_error')
    const audit = await AuditLog.query()
      .where('action', 'agent.query_rejected')
      .where('target_id', 'managed_user_profile')
      .where('actor_user_id', user.id)
      .firstOrFail()
    assert.deepEqual(
      {
        templateVersion: audit.metadata?.templateVersion,
        parameterNames: audit.metadata?.parameterNames,
        authorization: audit.metadata?.authorization,
        reason: audit.metadata?.reason,
      },
      {
        templateVersion: 1,
        parameterNames: ['userId'],
        authorization: 'allowed',
        reason: 'invalid_parameters',
      }
    )
    assert.notInclude(JSON.stringify(audit.metadata), 'not-an-id')
  })

  test('returns current role and permission assignments through permission-scoped templates', async ({
    assert,
  }) => {
    const { user, conversation } = await createAdminConversation()
    const suffix = Date.now()
    const permission = await Permission.create({
      code: `reports:${suffix}`,
      name: 'View reports',
      groupName: 'Reports',
      description: 'Allows viewing reports',
      isSystem: false,
    })
    const role = await Role.create({
      code: `reporter-${suffix}`,
      name: 'Reporter',
      description: 'Can view reports',
      isSystem: false,
    })
    await role.related('permissions').sync([permission.id])

    const roleResult = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'role_profile',
      params: { roleCode: role.code },
    })
    assert.deepEqual(roleResult, {
      kind: 'query_result',
      templateCode: 'role_profile',
      rows: [
        {
          id: role.id,
          code: role.code,
          name: 'Reporter',
          description: 'Can view reports',
          isSystem: false,
          userCount: 0,
          permissions: [
            {
              id: permission.id,
              code: permission.code,
              name: 'View reports',
              groupName: 'Reports',
            },
          ],
        },
      ],
    })

    const permissionResult = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'permission_usage',
      params: { permissionCode: permission.code },
    })
    assert.deepEqual(permissionResult, {
      kind: 'query_result',
      templateCode: 'permission_usage',
      rows: [
        {
          id: permission.id,
          code: permission.code,
          name: 'View reports',
          groupName: 'Reports',
          description: 'Allows viewing reports',
          isSystem: false,
          roles: [{ id: role.id, code: role.code, name: 'Reporter', isSystem: false }],
        },
      ],
    })
  })

  test('redacts recent access-control change actors and omits metadata', async ({ assert }) => {
    const { user, conversation } = await createAdminConversation()
    const audit = await AuditLog.create({
      actorUserId: user.id,
      action: 'role.updated',
      targetType: 'role',
      targetId: '123',
      metadata: { email: user.email, secret: 'must-not-return' },
    })

    const result = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'recent_access_control_changes',
      params: { limit: 1 },
    })

    assert.equal(result.kind, 'query_result')
    if (result.kind !== 'query_result') throw new Error('Expected a query result')
    assert.deepEqual(result.rows, [
      {
        id: audit.id,
        action: 'role.updated',
        targetType: 'role',
        targetId: '123',
        createdAt: audit.createdAt.toISO(),
        actor: { id: user.id, fullName: 'Q*' },
      },
    ])
    assert.notProperty(result.rows[0] as object, 'metadata')
  })

  test('uses bounded, permission-scoped templates for API Key, role, and permission lists', async ({
    assert,
  }) => {
    const { user, conversation } = await createAdminConversation()
    const suffix = Date.now()
    const apiKey = await ApiKey.create({
      name: `Query key ${suffix}`,
      prefix: `q${suffix}`,
      keyHash: `hash-${suffix}`,
    })
    const permission = await Permission.create({
      code: `reports:${suffix}`,
      name: 'View reports',
      groupName: 'Reports',
      description: 'Allows viewing reports',
      isSystem: false,
    })
    const role = await Role.create({
      code: `reporter-${suffix}`,
      name: 'Reporter',
      description: 'Can view reports',
      isSystem: false,
    })
    await role.related('permissions').sync([permission.id])

    const apiKeyResult = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'active_api_keys',
      params: {},
    })
    assert.equal(apiKeyResult.kind, 'query_result')
    if (apiKeyResult.kind !== 'query_result') throw new Error('Expected API Key query result')
    const apiKeyRow = apiKeyResult.rows.find(
      (row) => typeof row === 'object' && row !== null && 'id' in row && row.id === apiKey.id
    ) as Record<string, unknown> | undefined
    assert.deepEqual(apiKeyRow, {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      expiresAt: null,
      lastUsedAt: null,
    })
    assert.notProperty(apiKeyRow ?? {}, 'keyHash')

    const roleResult = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'roles_with_permissions',
      params: {},
    })
    assert.equal(roleResult.kind, 'query_result')
    if (roleResult.kind !== 'query_result') throw new Error('Expected role query result')
    assert.deepInclude(roleResult.rows, {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: false,
      userCount: 0,
      permissions: [{ id: permission.id, code: permission.code, name: permission.name }],
    })

    const permissionResult = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'permission_catalog',
      params: {},
    })
    assert.equal(permissionResult.kind, 'query_result')
    if (permissionResult.kind !== 'query_result')
      throw new Error('Expected permission query result')
    assert.deepInclude(permissionResult.rows, {
      id: permission.id,
      code: permission.code,
      name: permission.name,
      groupName: permission.groupName,
      description: permission.description,
      isSystem: false,
      roleCount: 1,
    })
    const queryAudits = await AuditLog.query()
      .where('action', 'agent.query_executed')
      .where('actor_user_id', user.id)
      .whereIn('target_id', ['active_api_keys', 'roles_with_permissions', 'permission_catalog'])
    const auditTemplateCodes = queryAudits.map((audit) => audit.targetId)
    assert.sameMembers(auditTemplateCodes, [
      'active_api_keys',
      'roles_with_permissions',
      'permission_catalog',
    ])
  })

  test('validates role-query parameters and denies every new access-control template', async ({
    assert,
  }) => {
    const { user, conversation } = await createAdminConversation()
    const invalid = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'role_profile',
      params: { roleCode: 'super-admin', unrestricted: true },
    })
    assert.deepEqual(invalid, { kind: 'query_error', message: '不支持的查询参数：unrestricted' })

    const deniedUser = await User.create({
      fullName: 'No Access',
      email: `no-access-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const deniedConversation = await AiChatConversation.create({
      userId: deniedUser.id,
      title: 'Denied access-control query',
    })
    for (const [templateCode, params] of [
      ['role_profile', { roleCode: 'super-admin' }],
      ['permission_usage', { permissionCode: 'users:read' }],
      ['recent_access_control_changes', {}],
      ['active_api_keys', {}],
      ['roles_with_permissions', {}],
      ['permission_catalog', {}],
    ] as const) {
      await assert.rejects(
        () =>
          runRegisteredAiQuery({
            conversationId: deniedConversation.id,
            userId: deniedUser.id,
            templateCode,
            params,
          }),
        '当前账号没有执行此查询的权限'
      )
    }
  })
})
