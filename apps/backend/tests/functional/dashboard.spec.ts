import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'

test.group('dashboard overview', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('returns permitted metrics and seven-day trends', async ({ client, assert }) => {
    const dashboardPermission = await Permission.findByOrFail('code', 'dashboard:view')
    const usersPermission = await Permission.findByOrFail('code', 'users:read')
    const auditLogsPermission = await Permission.findByOrFail('code', 'audit-logs:read')
    const systemStatusPermission = await Permission.findByOrFail('code', 'system-status:read')
    const role = await Role.create({ code: `dashboard-${Date.now()}`, name: 'Dashboard reader' })
    await role
      .related('permissions')
      .sync([
        dashboardPermission.id,
        usersPermission.id,
        auditLogsPermission.id,
        systemStatusPermission.id,
      ])

    const user = await User.create({
      fullName: 'Dashboard reader',
      email: `dashboard-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([role.id])
    const token = await User.accessTokens.create(user)

    const response = await client
      .get('/api/v1/dashboard/overview')
      .bearerToken(token.value!.release())
    response.assertStatus(200)

    const overview = response.body().data as {
      generatedAt: string
      activeUsers: number | null
      roles: number | null
      activeApiKeys: number | null
      knowledgeDocuments: number | null
      auditEvents: number | null
      aiModelCalls: number | null
      aiTokensUsed: number | null
      auditTrend: Array<{ date: string; count: number }> | null
      aiCallTrend: Array<{ date: string; count: number }> | null
    }
    assert.isString(overview.generatedAt)
    assert.isAtLeast(overview.activeUsers ?? 0, 1)
    assert.isAtLeast(overview.auditEvents ?? 0, 0)
    assert.isAtLeast(overview.aiModelCalls ?? 0, 0)
    assert.isAtLeast(overview.aiTokensUsed ?? 0, 0)
    assert.lengthOf(overview.auditTrend ?? [], 7)
    assert.lengthOf(overview.aiCallTrend ?? [], 7)
    assert.isNull(overview.roles)
    assert.isNull(overview.activeApiKeys)
    assert.isNull(overview.knowledgeDocuments)
  })

  test('returns null for metrics without their module permission', async ({ client, assert }) => {
    const dashboardPermission = await Permission.findByOrFail('code', 'dashboard:view')
    const role = await Role.create({
      code: `dashboard-only-${Date.now()}`,
      name: 'Dashboard only reader',
    })
    await role.related('permissions').sync([dashboardPermission.id])

    const user = await User.create({
      fullName: 'Dashboard only reader',
      email: `dashboard-only-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([role.id])
    const token = await User.accessTokens.create(user)

    const response = await client
      .get('/api/v1/dashboard/overview')
      .bearerToken(token.value!.release())
    response.assertStatus(200)

    const overview = response.body().data as Record<string, unknown>
    for (const key of [
      'activeUsers',
      'roles',
      'activeApiKeys',
      'knowledgeDocuments',
      'auditEvents',
      'aiModelCalls',
      'aiTokensUsed',
      'auditTrend',
      'aiCallTrend',
    ]) {
      assert.isNull(overview[key], `${key} should require its own read permission`)
    }
  })

  test('denies accounts without dashboard permission', async ({ client }) => {
    const role = await Role.create({ code: `no-dashboard-${Date.now()}`, name: 'Other reader' })
    const user = await User.create({
      fullName: 'Other reader',
      email: `other-reader-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([role.id])
    const token = await User.accessTokens.create(user)

    const response = await client
      .get('/api/v1/dashboard/overview')
      .bearerToken(token.value!.release())
    response.assertStatus(403)
  })
})
