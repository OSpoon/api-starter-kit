import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'

import {
  getPendingAiQueryContext,
  runRegisteredAiQuery,
} from '#ai/registry/ai_agent_query_registry'
import type { AiAgentToolWithConfirmation } from '#ai/registry/ai_agent_tool_helpers'
import { createAiAgentTools } from '#ai/registry/ai_agent_tool_registry'
import AiAgentPendingQuery from '#models/ai_agent_pending_query'
import AiChatConversation from '#models/ai_chat_conversation'
import ApiKey from '#models/api_key'
import AuditLog from '#models/audit_log'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import WecomMessageTemplate from '#models/wecom_message_template'
import { generateInitialPassword } from '#security/user_credentials'

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
    const tools = createAiAgentTools({
      userId: 1,
      conversationId: 1,
      agentRunId: 'test-run',
    })
    const toolNames = tools.map((registeredTool) => registeredTool.name)

    assert.include(toolNames, 'run_registered_query')
    assert.notInclude(toolNames, 'list_api_keys')
    assert.notInclude(toolNames, 'list_roles')
    assert.notInclude(toolNames, 'list_permissions')

    const queryTool = tools.find((tool) => tool.name === 'run_registered_query')
    const schema = queryTool?.parameters as unknown as {
      properties?: {
        params?: { properties?: { page?: { type?: string; minimum?: number } } }
      }
    }
    assert.equal(schema.properties?.params?.properties?.page?.type, 'integer')
    assert.equal(schema.properties?.params?.properties?.page?.minimum, 1)
  })

  test('rejects an invalid page before creating its confirmation card', async ({ assert }) => {
    const { user, conversation } = await createAdminConversation()
    const queryTool = createAiAgentTools({
      userId: user.id,
      conversationId: conversation.id,
      agentRunId: 'invalid-page-test',
    }).find((tool) => tool.name === 'run_registered_query') as
      | AiAgentToolWithConfirmation
      | undefined
    assert.isFunction(queryTool?.prepareConfirmation)

    await assert.rejects(
      () =>
        queryTool?.prepareConfirmation?.({
          templateCode: 'recent_audit_logs',
          params: { page: 'Optional 1-based page number; omit for page 1.' },
        }),
      /页码必须为正整数；查询第一页时请省略页码。/
    )
  })

  test('denies a registered query when the requester lacks its named permission', async ({
    assert,
  }) => {
    const user = await User.create({
      fullName: 'Unprivileged query user',
      email: `unprivileged-query-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const result = await runRegisteredAiQuery({
      conversationId: 1,
      userId: user.id,
      templateCode: 'managed_users',
      params: {},
    })

    assert.deepEqual(result, {
      kind: 'query_error',
      code: 'permission_denied',
      message: '当前账号没有执行此查询的权限',
    })
    assert.exists(
      await AuditLog.query()
        .where('action', 'agent.query_rejected')
        .where('target_id', 'managed_users')
        .where('reason_code', 'permission_denied')
        .first()
    )
  })

  test('rejects a pending query whose persisted parameters are not an object', async ({
    assert,
  }) => {
    const { user, conversation } = await createAdminConversation()
    await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'managed_user_profile',
      params: {},
    })
    const pending = await AiAgentPendingQuery.query()
      .where('conversation_id', conversation.id)
      .firstOrFail()
    pending.params = [] as unknown as Record<string, unknown>
    await pending.save()

    await assert.rejects(() => AiAgentPendingQuery.findOrFail(pending.id), /params/)
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
      missingFields: [
        {
          name: 'userIdOrExactEmailOrName',
          description: 'Required managed-user ID, exact email, or exact full name.',
        },
      ],
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
    assert.include(pendingContext, '"missingRequired":["userIdOrExactEmailOrName"]')

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
        templateVersion: 3,
        parameterNames: ['userId'],
        resultCount: 1,
        authorization: 'allowed',
      }
    )
    assert.isNumber(audit.metadata?.durationMs)
  })

  test('resolves managed users by exact name or email and reports ambiguous names', async ({
    assert,
  }) => {
    const { user, conversation } = await createAdminConversation()
    const first = await User.create({
      fullName: 'Exact Match User',
      email: `exact-match-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const emailMatch = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'managed_user_profile',
      params: { email: first.email },
    })
    assert.equal(emailMatch.kind, 'query_result')
    if (emailMatch.kind !== 'query_result') throw new Error('Expected exact email result')
    assert.deepEqual(emailMatch.match, { status: 'matched', field: 'email' })
    assert.equal(emailMatch.rows.length, 1)
    assert.equal((emailMatch.rows[0] as { id: number }).id, first.id)
    assert.notInclude(JSON.stringify(emailMatch.rows), first.email)

    const second = await User.create({
      fullName: first.fullName,
      email: `exact-match-second-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const nameMatch = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'managed_user_profile',
      params: { fullName: first.fullName },
    })
    assert.equal(nameMatch.kind, 'query_result')
    if (nameMatch.kind !== 'query_result') throw new Error('Expected exact name result')
    assert.deepEqual(nameMatch.match, { status: 'ambiguous', field: 'fullName' })
    assert.deepEqual(
      nameMatch.rows.map((row) => (row as { id: number }).id).sort(),
      [first.id, second.id].sort()
    )
    assert.include(nameMatch.message ?? '', 'choose by ID')
    assert.notInclude(JSON.stringify(nameMatch.rows), first.email)
    assert.notInclude(JSON.stringify(nameMatch.rows), second.email)
  })

  test('looks up an API Key profile by ID with status and without the key hash', async ({
    assert,
  }) => {
    const { user, conversation } = await createAdminConversation()
    const suffix = Date.now()
    const active = await ApiKey.create({
      name: `Profile active ${suffix}`,
      prefix: `pa${suffix}`,
      keyHash: `hash-active-${suffix}`,
    })
    const revoked = await ApiKey.create({
      name: `Profile revoked ${suffix}`,
      prefix: `pr${suffix}`,
      keyHash: `hash-revoked-${suffix}`,
      revokedAt: DateTime.now(),
    })

    const activeResult = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'api_key_profile',
      params: { apiKeyId: String(active.id) },
    })
    assert.deepEqual(activeResult, {
      kind: 'query_result',
      templateCode: 'api_key_profile',
      rows: [
        {
          id: active.id,
          name: active.name,
          prefix: active.prefix,
          status: 'active',
          expiresAt: null,
        },
      ],
    })
    assert.notInclude(JSON.stringify(activeResult), 'hash-')

    const revokedResult = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'api_key_profile',
      params: { apiKeyId: String(revoked.id) },
    })
    assert.deepEqual(revokedResult, {
      kind: 'query_result',
      templateCode: 'api_key_profile',
      rows: [
        {
          id: revoked.id,
          name: revoked.name,
          prefix: revoked.prefix,
          status: 'revoked',
          expiresAt: null,
        },
      ],
    })

    const missing = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'api_key_profile',
      params: {},
    })
    assert.deepEqual(missing, {
      kind: 'missing_parameters',
      templateCode: 'api_key_profile',
      missingFields: [
        { name: 'apiKeyIdOrName', description: 'Required positive API Key ID or exact name.' },
      ],
    })
    const byName = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'api_key_profile',
      params: { name: revoked.name },
    })
    assert.equal(byName.kind, 'query_result')
    assert.equal((byName as { rows: Array<{ id: number }> }).rows[0]?.id, revoked.id)
    const byIdAlias = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'api_key_profile',
      params: { id: revoked.id },
    })
    assert.equal(byIdAlias.kind, 'query_result')
    assert.equal((byIdAlias as { rows: Array<{ id: number }> }).rows[0]?.id, revoked.id)
    const completed = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'api_key_profile',
      params: { apiKeyId: String(revoked.id) },
    })
    assert.equal(completed.kind, 'query_result')
  })

  test('resolves an exact revoked API Key name when a similar active name exists', async ({
    assert,
  }) => {
    const { user, conversation } = await createAdminConversation()
    const suffix = Date.now()
    const revoked = await ApiKey.create({
      name: `Browser-QA-Cancelled-${suffix}`,
      prefix: `rev${suffix}`,
      keyHash: `hash-revoked-${suffix}`,
      revokedAt: DateTime.now(),
    })
    const similar = await ApiKey.create({
      name: `Browser-qa-cancelled-${suffix}`,
      prefix: `act${suffix}`,
      keyHash: `hash-active-${suffix}`,
    })

    const activeKeys = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'active_api_keys',
      params: {},
    })
    assert.equal(activeKeys.kind, 'query_result')
    if (activeKeys.kind !== 'query_result') throw new Error('Expected active API Key result')
    assert.isTrue(activeKeys.rows.some((row) => (row as { id: number }).id === similar.id))
    assert.isFalse(activeKeys.rows.some((row) => (row as { id: number }).id === revoked.id))

    const exactProfile = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'api_key_profile',
      params: { name: revoked.name },
    })
    assert.deepEqual(exactProfile, {
      kind: 'query_result',
      templateCode: 'api_key_profile',
      rows: [
        {
          id: revoked.id,
          name: revoked.name,
          prefix: revoked.prefix,
          status: 'revoked',
          expiresAt: null,
        },
      ],
    })
  })

  test('lists only revoked API Keys as deletion candidates without exposing secrets', async ({
    assert,
  }) => {
    const { user, conversation } = await createAdminConversation()
    const suffix = Date.now()
    const revoked = await ApiKey.create({
      name: `Revoked deletion candidate ${suffix}`,
      prefix: `rd${suffix}`,
      keyHash: `hash-revoked-${suffix}`,
      revokedAt: DateTime.now(),
    })
    const active = await ApiKey.create({
      name: `Active key ${suffix}`,
      prefix: `ak${suffix}`,
      keyHash: `hash-active-${suffix}`,
    })

    const result = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'revoked_api_keys',
      params: {},
    })

    assert.equal(result.kind, 'query_result')
    if (result.kind !== 'query_result') throw new Error('Expected revoked API Key results')
    assert.deepInclude(result.rows, {
      id: revoked.id,
      name: revoked.name,
      prefix: revoked.prefix,
      revokedAt: revoked.revokedAt?.toISO(),
      expiresAt: null,
    })
    assert.isFalse(result.rows.some((row) => (row as { id: number }).id === active.id))
    assert.notInclude(JSON.stringify(result.rows), 'hash-')
  })

  test('rejects unknown parameters without persisting them', async ({ assert }) => {
    const { user, conversation } = await createAdminConversation()

    const result = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'managed_user_profile',
      params: { userId: 1, sql: 'select * from users' },
    })

    assert.deepEqual(result, {
      kind: 'query_error',
      code: 'invalid_input',
      message: '不支持的查询参数：sql',
    })
    assert.isNull(
      await AiAgentPendingQuery.query().where('conversation_id', conversation.id).first()
    )
    const audit = await AuditLog.query()
      .where('action', 'agent.query_rejected')
      .where('target_id', 'managed_user_profile')
      .firstOrFail()
    assert.deepEqual(audit.metadata, {
      templateVersion: 3,
      parameterNames: ['userId', 'sql'],
      unknownParameterNames: ['sql'],
      authorization: 'allowed',
      reason: 'unsupported_parameters',
      durationMs: audit.metadata?.durationMs,
    })
    assert.isNumber(audit.metadata?.durationMs)
    assert.notProperty(audit.metadata ?? {}, 'params')
  })

  test('runs registered queries for users with the matching read permission', async ({
    assert,
  }) => {
    const permission = await Permission.findByOrFail('code', 'users:read')
    const role = await Role.create({ code: `query-reader-${Date.now()}`, name: 'Query Reader' })
    await role.related('permissions').sync([permission.id])
    const user = await User.create({
      fullName: 'Query Reader',
      email: `query-reader-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([role.id])
    const conversation = await AiChatConversation.create({ userId: user.id, title: 'Denied query' })

    const result = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'managed_users',
      params: {},
    })
    assert.equal(result.kind, 'query_result')
    assert.isNull(
      await AiAgentPendingQuery.query().where('conversation_id', conversation.id).first()
    )
    const audit = await AuditLog.query()
      .where('action', 'agent.query_executed')
      .where('target_id', 'managed_users')
      .where('actor_user_id', user.id)
      .firstOrFail()
    assert.deepEqual(
      {
        templateVersion: audit.metadata?.templateVersion,
        parameterNames: audit.metadata?.parameterNames,
        authorization: audit.metadata?.authorization,
        resultCount: audit.metadata?.resultCount,
      },
      {
        templateVersion: 2,
        parameterNames: ['page'],
        authorization: 'allowed',
        resultCount: result.kind === 'query_result' ? result.rows.length : 0,
      }
    )
    assert.equal(result.kind, 'query_result')
    if (result.kind !== 'query_result') throw new Error('Expected managed user query results')
    assert.include(
      result.rows.map((row) => (row as { id: number }).id),
      user.id
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
        templateVersion: 3,
        parameterNames: ['userId'],
        authorization: 'allowed',
        reason: 'invalid_parameters',
      }
    )
    assert.notInclude(JSON.stringify(audit.metadata), 'not-an-id')
  })

  test('omits unregistered permissions from permission-scoped templates', async ({ assert }) => {
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
          permissions: [],
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
      rows: [],
      message: 'No permission matched that code.',
    })

    const catalogResult = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'permission_catalog',
      params: {},
    })
    assert.equal(catalogResult.kind, 'query_result')
    if (catalogResult.kind !== 'query_result')
      throw new Error('Expected permission catalog query result')
    assert.notInclude(JSON.stringify(catalogResult.rows), permission.code)
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
      params: {},
    })

    assert.equal(result.kind, 'query_result')
    if (result.kind !== 'query_result') throw new Error('Expected a query result')
    const row = result.rows.find((item) => (item as { id: number }).id === audit.id)
    assert.deepEqual(row, {
      id: audit.id,
      action: 'role.updated',
      targetType: 'role',
      targetId: '123',
      createdAt: audit.createdAt.toISO(),
      actor: { fullName: 'Q*' },
    })
    assert.notProperty(row as object, 'metadata')
    assert.notProperty((row as { actor?: object }).actor ?? {}, 'id')
  })

  test('redacts recent audit-log actors and excludes IPs, user agents, and metadata', async ({
    assert,
  }) => {
    const { user, conversation } = await createAdminConversation()
    const audit = await AuditLog.create({
      actorUserId: user.id,
      action: 'user.updated',
      targetType: 'user',
      targetId: '7',
      metadata: { email: user.email, ipAddress: '10.0.0.1', userAgent: 'curl/8.0' },
    })

    const result = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'recent_audit_logs',
      params: {},
    })

    assert.equal(result.kind, 'query_result')
    if (result.kind !== 'query_result') throw new Error('Expected a query result')
    const auditRow = result.rows.find(
      (row) => typeof row === 'object' && row !== null && 'id' in row && row.id === audit.id
    ) as Record<string, unknown> | undefined
    assert.deepEqual(auditRow, {
      id: audit.id,
      action: 'user.updated',
      targetType: 'user',
      targetId: '7',
      createdAt: audit.createdAt.toISO(),
      actor: { fullName: 'Q*' },
    })
    assert.notProperty(auditRow ?? {}, 'metadata')
    assert.notProperty((auditRow as { actor?: object }).actor ?? {}, 'id')
    assert.notInclude(JSON.stringify(result.rows), user.email)
  })

  test('uses page one when an optional page is null or blank', async ({ assert }) => {
    const { user, conversation } = await createAdminConversation()

    for (const page of [null, '']) {
      const result = await runRegisteredAiQuery({
        conversationId: conversation.id,
        userId: user.id,
        templateCode: 'recent_audit_logs',
        params: { page },
      })
      assert.equal(result.kind, 'query_result')
    }
  })

  test('does not expose the query parameter schema description as a user error', async ({
    assert,
  }) => {
    const { user, conversation } = await createAdminConversation()
    const result = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'recent_audit_logs',
      params: { page: 'Optional 1-based page number; omit for page 1.' },
    })

    assert.deepEqual(result, {
      kind: 'query_error',
      code: 'invalid_input',
      message: '页码必须为正整数；查询第一页时请省略页码。',
    })
  })

  test('uses permission-scoped templates for API Key, role, and permission lists', async ({
    assert,
  }) => {
    const { user, conversation } = await createAdminConversation()
    const suffix = Date.now()
    const apiKey = await ApiKey.create({
      name: `Query key ${suffix}`,
      prefix: `q${suffix}`,
      keyHash: `hash-${suffix}`,
    })
    const permission = await Permission.findByOrFail('code', 'dashboard:view')
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
    assert.include(
      permissionResult.rows.map((row) => (row as { code: string }).code),
      permission.code
    )
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

  test('paginates AI query results without dropping later rows', async ({ assert }) => {
    const { user, conversation } = await createAdminConversation()
    await ApiKey.query().whereNull('revoked_at').update({ revokedAt: DateTime.now() })
    const suffix = Date.now()
    const keys = []
    for (let index = 0; index < 21; index += 1) {
      keys.push(
        await ApiKey.create({
          name: `Paged key ${suffix}-${index}`,
          prefix: `p${String(suffix).slice(-5)}${index.toString().padStart(2, '0')}`,
          keyHash: `hash-paged-${suffix}-${index}`,
        })
      )
    }

    const pageOne = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'active_api_keys',
      params: { page: 1 },
    })
    const pageTwo = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'active_api_keys',
      params: { page: 2 },
    })
    assert.equal(pageOne.kind, 'query_result')
    assert.equal(pageTwo.kind, 'query_result')
    if (pageOne.kind !== 'query_result' || pageTwo.kind !== 'query_result') {
      throw new Error('Expected paginated API Key query results')
    }

    assert.lengthOf(pageOne.rows, 20)
    assert.lengthOf(pageTwo.rows, 1)
    assert.include(pageOne.message ?? '', 'Request page=2 to continue.')
    assert.include(pageTwo.message ?? '', 'This is the final page.')
    assert.sameMembers(
      [...pageOne.rows, ...pageTwo.rows].map((row) => (row as { id: number }).id),
      keys.map((key) => key.id)
    )
  })

  test('validates role-query parameters and denies templates without matching RBAC grants', async ({
    assert,
  }) => {
    const { user, conversation } = await createAdminConversation()
    const invalid = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'role_profile',
      params: { roleCode: 'super-admin', unrestricted: true },
    })
    assert.deepEqual(invalid, {
      kind: 'query_error',
      code: 'invalid_input',
      message: '不支持的查询参数：unrestricted',
    })

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
      ['api_key_profile', { apiKeyId: 1 }],
      ['roles_with_permissions', {}],
      ['permission_catalog', {}],
    ] as const) {
      const result = await runRegisteredAiQuery({
        conversationId: deniedConversation.id,
        userId: deniedUser.id,
        templateCode,
        params,
      })
      assert.deepEqual(
        result,
        {
          kind: 'query_error',
          code: 'permission_denied',
          message: '当前账号没有执行此查询的权限',
        },
        templateCode
      )
    }
  })

  test('lists and previews enabled WeCom templates without exposing Webhooks', async ({
    assert,
  }) => {
    const { user, conversation } = await createAdminConversation()
    const template = await WecomMessageTemplate.create({
      name: `AI weather template ${Date.now()}`,
      description: 'AI test template',
      msgtype: 'text',
      webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret',
      payload: {
        msgtype: 'text',
        text: { content: '{{region}}今日天气：{{temperature}}度' },
      },
      parameters: [
        { name: 'region', type: 'string', required: true },
        { name: 'temperature', type: 'string', required: true },
      ],
      enabled: true,
    })

    const listed = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'wecom_message_templates',
      params: {},
    })
    assert.equal(listed.kind, 'query_result')
    if (listed.kind !== 'query_result') throw new Error('Expected template list result')
    assert.exists(
      listed.rows.find(
        (row) =>
          typeof row === 'object' &&
          row !== null &&
          'id' in row &&
          row.id === template.id &&
          'name' in row &&
          row.name === template.name &&
          'msgtype' in row &&
          row.msgtype === 'text'
      )
    )
    assert.notInclude(JSON.stringify(listed.rows), 'secret')

    const preview = await runRegisteredAiQuery({
      conversationId: conversation.id,
      userId: user.id,
      templateCode: 'wecom_message_preview',
      params: {
        templateId: template.id,
        params: { region: '北京', temperature: '35' },
        mentionedList: ['zhangsan'],
      },
    })
    assert.equal(preview.kind, 'query_result')
    if (preview.kind !== 'query_result') throw new Error('Expected template preview result')
    assert.deepEqual(preview.rows[0], {
      templateId: template.id,
      name: template.name,
      msgtype: 'text',
      payload: {
        msgtype: 'text',
        text: { content: '北京今日天气：35度', mentioned_list: ['zhangsan'] },
      },
    })
  })
})
