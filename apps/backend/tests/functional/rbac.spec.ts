import { Bouncer } from '@adonisjs/bouncer'
import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import { access } from '#abilities/main'
import AuditLog from '#models/audit_log'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'

test.group('rbac', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('writes pivot timestamps when assigning permissions to a role', async ({ assert }) => {
    const role = await Role.create({ code: `role-${Date.now()}`, name: 'Test role' })
    const permission = await Permission.query().firstOrFail()

    await role.related('permissions').sync([permission.id])

    const assignedRole = await Role.query()
      .where('id', role.id)
      .preload('permissions')
      .firstOrFail()
    assert.deepEqual(
      assignedRole.permissions.map((item) => item.id),
      [permission.id]
    )
  })

  test('denies an API key delete permission that is not granted by any role', async ({
    assert,
  }) => {
    const permission = await Permission.findByOrFail('code', 'api-keys:read')
    const role = await Role.create({ code: `reader-${Date.now()}`, name: 'Reader' })
    const user = await User.create({
      fullName: 'Reader',
      email: `reader-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await role.related('permissions').sync([permission.id])
    await user.related('roles').sync([role.id])

    const bouncer = new Bouncer(() => user, { access })
    assert.isFalse(await bouncer.allows('access', 'api-keys:delete'))
  })

  test('keeps IM configuration updates separate from LLM configuration updates', async ({
    assert,
  }) => {
    const imUpdatePermission = await Permission.findByOrFail('code', 'im-config:update')
    const role = await Role.create({ code: `im-reader-${Date.now()}`, name: 'IM operator' })
    const user = await User.create({
      fullName: 'IM operator',
      email: `im-operator-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await role.related('permissions').sync([imUpdatePermission.id])
    await user.related('roles').sync([role.id])

    const bouncer = new Bouncer(() => user, { access })
    assert.isTrue(await bouncer.allows('access', 'im-config:update'))
    assert.isFalse(await bouncer.allows('access', 'llm-config:update'))
  })

  test('protects the service status endpoint with its dedicated read permission', async ({
    client,
  }) => {
    const statusPermission = await Permission.findByOrFail('code', 'system-status:read')
    const statusRole = await Role.create({ code: `status-${Date.now()}`, name: 'Status reader' })
    await statusRole.related('permissions').sync([statusPermission.id])

    const reader = await User.create({
      fullName: 'Status reader',
      email: `status-reader-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await reader.related('roles').sync([statusRole.id])
    const readerToken = await User.accessTokens.create(reader)

    const allowedResponse = await client
      .get('/api/v1/system/status')
      .bearerToken(readerToken.value!.release())
    allowedResponse.assertStatus(200)

    const allowedAiOverviewResponse = await client
      .get('/api/v1/system/ai-overview')
      .bearerToken(readerToken.value!.release())
    allowedAiOverviewResponse.assertStatus(200)

    const dashboardPermission = await Permission.findByOrFail('code', 'dashboard:view')
    const dashboardRole = await Role.create({
      code: `dashboard-${Date.now()}`,
      name: 'Dashboard reader',
    })
    await dashboardRole.related('permissions').sync([dashboardPermission.id])
    const dashboardReader = await User.create({
      fullName: 'Dashboard reader',
      email: `dashboard-reader-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await dashboardReader.related('roles').sync([dashboardRole.id])
    const dashboardToken = await User.accessTokens.create(dashboardReader)

    const deniedResponse = await client
      .get('/api/v1/system/status')
      .bearerToken(dashboardToken.value!.release())
    deniedResponse.assertStatus(403)

    const deniedAiOverviewResponse = await client
      .get('/api/v1/system/ai-overview')
      .bearerToken(dashboardToken.value!.release())
    deniedAiOverviewResponse.assertStatus(403)
  })

  test('generates a 15-character password that satisfies the strength requirements', async ({
    assert,
  }) => {
    const password = generateInitialPassword()
    assert.lengthOf(password, 15)
    assert.match(password, /[a-z]/)
    assert.match(password, /[A-Z]/)
    assert.match(password, /\d/)
    assert.match(password, /[^A-Za-z0-9]/)
  })

  test('serializes roles at the top level of user list items', async ({ client, assert }) => {
    const role = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'List user',
      email: `list-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([role.id])
    const token = await User.accessTokens.create(user)

    const response = await client.get('/api/v1/system/users').bearerToken(token.value!.release())
    response.assertStatus(200)
    const body = response.body() as unknown as {
      data: {
        items: Array<{ id: number; roles?: unknown[] }>
        meta: { currentPage: number; lastPage: number }
      }
    }
    const listedUser = body.data.items.find((item) => item.id === user.id)
    assert.isArray(listedUser?.roles)
    assert.equal(body.data.meta.currentPage, 1)
    assert.isAtLeast(body.data.meta.lastPage, 1)
  })

  test('rejects user role assignments with missing IDs without partially mutating users', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const admin = await User.create({
      fullName: 'Role assignment admin',
      email: `role-assignment-admin-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await admin.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(admin)
    const bearerToken = token.value!.release()
    const targetRole = await Role.create({ code: `target-${Date.now()}`, name: 'Target role' })
    const target = await User.create({
      fullName: 'Original target',
      email: `role-assignment-target-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await target.related('roles').sync([targetRole.id])

    const updateResponse = await client
      .put(`/api/v1/system/users/${target.id}`)
      .bearerToken(bearerToken)
      .json({ fullName: 'Changed target', email: target.email, roleIds: [999_999_999] })

    updateResponse.assertStatus(409)
    assert.equal(
      (updateResponse.body() as unknown as { message: string }).message,
      '包含不存在的角色'
    )
    const unchanged = await User.query().where('id', target.id).preload('roles').firstOrFail()
    assert.equal(unchanged.fullName, 'Original target')
    assert.deepEqual(
      unchanged.roles.map((role) => role.id),
      [targetRole.id]
    )
    assert.isNull(
      await AuditLog.query()
        .where('action', 'user.updated')
        .where('targetId', String(target.id))
        .first()
    )

    const email = `invalid-role-target-${Date.now()}@example.com`
    const createResponse = await client
      .post('/api/v1/system/users')
      .bearerToken(bearerToken)
      .json({ fullName: 'Invalid role target', email, roleIds: [999_999_999] })

    createResponse.assertStatus(409)
    assert.equal(
      (createResponse.body() as unknown as { message: string }).message,
      '包含不存在的角色'
    )
    assert.isNull(await User.findBy('email', email))
  })

  test('validates role permission IDs before updating role fields', async ({ client, assert }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const admin = await User.create({
      fullName: 'Role update admin',
      email: `role-update-admin-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await admin.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(admin)
    const bearerToken = token.value!.release()
    const role = await Role.create({ code: `role-update-${Date.now()}`, name: 'Original role' })
    const permission = await Permission.findByOrFail('code', 'dashboard:view')
    await role.related('permissions').sync([permission.id])

    const response = await client
      .put(`/api/v1/system/roles/${role.id}`)
      .bearerToken(bearerToken)
      .json({ name: 'Changed role', description: 'Changed', permissionIds: [999_999_999] })

    response.assertStatus(409)
    const unchanged = await Role.query().where('id', role.id).preload('permissions').firstOrFail()
    assert.equal(unchanged.name, 'Original role')
    assert.isNull(unchanged.description)
    assert.deepEqual(
      unchanged.permissions.map((item) => item.id),
      [permission.id]
    )
    assert.isNull(
      await AuditLog.query()
        .where('action', 'role.updated')
        .where('targetId', String(role.id))
        .first()
    )

    const code = `invalid-permission-${Date.now()}`
    const createResponse = await client
      .post('/api/v1/system/roles')
      .bearerToken(bearerToken)
      .json({ code, name: 'Invalid permission role', permissionIds: [999_999_999] })

    createResponse.assertStatus(409)
    assert.isNull(await Role.findBy('code', code))

    const validCode = `managed-role-${Date.now()}`
    const validCreateResponse = await client
      .post('/api/v1/system/roles')
      .bearerToken(bearerToken)
      .json({ code: validCode, name: 'Managed role', permissionIds: [permission.id] })

    validCreateResponse.assertStatus(200)
    const createdRole = await Role.query()
      .where('code', validCode)
      .preload('permissions')
      .firstOrFail()
    assert.deepEqual(
      createdRole.permissions.map((item) => item.id),
      [permission.id]
    )
    assert.isNotNull(
      await AuditLog.query()
        .where('action', 'role.created')
        .where('targetId', String(createdRole.id))
        .first()
    )
  })

  test('applies self role and super-admin grant protections inside the user mutation path', async ({
    client,
    assert,
  }) => {
    const updatePermission = await Permission.findByOrFail('code', 'users:update')
    const operatorRole = await Role.create({
      code: `self-operator-${Date.now()}`,
      name: 'Operator',
    })
    await operatorRole.related('permissions').sync([updatePermission.id])
    const operator = await User.create({
      fullName: 'Self role operator',
      email: `self-role-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await operator.related('roles').sync([operatorRole.id])
    const operatorToken = await User.accessTokens.create(operator)

    const selfUpdate = await client
      .put(`/api/v1/system/users/${operator.id}`)
      .bearerToken(operatorToken.value!.release())
      .json({ fullName: 'Changed self', email: operator.email, roleIds: [] })

    selfUpdate.assertStatus(400)
    const unchangedOperator = await User.query()
      .where('id', operator.id)
      .preload('roles')
      .firstOrFail()
    assert.equal(unchangedOperator.fullName, 'Self role operator')
    assert.deepEqual(
      unchangedOperator.roles.map((role) => role.id),
      [operatorRole.id]
    )

    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const admin = await User.create({
      fullName: 'Role grant admin',
      email: `role-grant-admin-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await admin.related('roles').sync([superAdminRole.id])
    const adminToken = await User.accessTokens.create(admin)
    const targetRole = await Role.create({ code: `grant-target-${Date.now()}`, name: 'Target' })
    const target = await User.create({
      fullName: 'Regular role target',
      email: `role-grant-target-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await target.related('roles').sync([targetRole.id])

    const grantResponse = await client
      .put(`/api/v1/system/users/${target.id}`)
      .bearerToken(adminToken.value!.release())
      .json({ fullName: 'Changed target', email: target.email, roleIds: [superAdminRole.id] })

    grantResponse.assertStatus(403)
    const unchangedTarget = await User.query().where('id', target.id).preload('roles').firstOrFail()
    assert.equal(unchangedTarget.fullName, 'Regular role target')
    assert.deepEqual(
      unchangedTarget.roles.map((role) => role.id),
      [targetRole.id]
    )
  })

  test('denies a non-super-admin from maintaining a super-admin account', async ({
    client,
    assert,
  }) => {
    const updatePermission = await Permission.findByOrFail('code', 'users:update')
    const deletePermission = await Permission.findByOrFail('code', 'users:delete')
    const operatorRole = await Role.create({ code: `operator-${Date.now()}`, name: 'Operator' })
    await operatorRole.related('permissions').sync([updatePermission.id, deletePermission.id])

    const operator = await User.create({
      fullName: 'Operator',
      email: `operator-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await operator.related('roles').sync([operatorRole.id])

    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const superAdmin = await User.create({
      fullName: 'Protected admin',
      email: `protected-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await superAdmin.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(operator)
    const bearerToken = token.value!.release()

    const updateResponse = await client
      .put(`/api/v1/system/users/${superAdmin.id}`)
      .bearerToken(bearerToken)
      .json({
        fullName: 'Changed admin',
        email: superAdmin.email,
        roleIds: [superAdminRole.id],
      })
    updateResponse.assertStatus(403)

    const resetResponse = await client
      .post(`/api/v1/system/users/${superAdmin.id}/reset-password`)
      .bearerToken(bearerToken)
    resetResponse.assertStatus(403)

    const deleteResponse = await client
      .delete(`/api/v1/system/users/${superAdmin.id}`)
      .bearerToken(bearerToken)
    deleteResponse.assertStatus(403)
    assert.isNotNull(await User.find(superAdmin.id))
  })

  test('records permission changes and protects the audit log endpoint', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const admin = await User.create({
      fullName: 'Audit admin',
      email: `audit-admin-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await admin.related('roles').sync([superAdminRole.id])
    const adminToken = await User.accessTokens.create(admin)

    const createResponse = await client
      .post('/api/v1/system/permissions')
      .bearerToken(adminToken.value!.release())
      .json({
        code: `reports-${Date.now()}:read`,
        name: 'Read reports',
        groupName: 'Reports',
      })
    createResponse.assertStatus(200)

    const auditLog = await AuditLog.query()
      .where('action', 'permission.created')
      .where('actorUserId', admin.id)
      .firstOrFail()
    assert.equal(auditLog.actorUserId, admin.id)
    assert.equal(auditLog.targetType, 'permission')

    const readerPermission = await Permission.findByOrFail('code', 'permissions:read')
    const readerRole = await Role.create({
      code: `audit-reader-${Date.now()}`,
      name: 'Audit reader',
    })
    await readerRole.related('permissions').sync([readerPermission.id])
    const reader = await User.create({
      fullName: 'Audit reader',
      email: `audit-reader-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await reader.related('roles').sync([readerRole.id])
    const readerToken = await User.accessTokens.create(reader)

    const deniedResponse = await client
      .get('/api/v1/system/audit-logs')
      .bearerToken(readerToken.value!.release())
    deniedResponse.assertStatus(403)

    const allowedResponse = await client
      .get('/api/v1/system/audit-logs')
      .bearerToken(adminToken.value!.release())
    allowedResponse.assertStatus(200)

    const searchId = String(Date.now())
    const searchIp = 'audit-ip-only-192.0.2.9'
    const searchableLog = await AuditLog.create({
      actorUserId: admin.id,
      action: 'search.test',
      targetType: 'search_target',
      targetId: searchId,
      metadata: null,
      ipAddress: searchIp,
      userAgent: null,
      requestId: null,
    })
    const searchResponse = await client
      .get(`/api/v1/system/audit-logs?search=${encodeURIComponent(searchIp)}&page=1&limit=1`)
      .bearerToken(adminToken.value!.release())
    searchResponse.assertStatus(200)
    const searchItems = (
      searchResponse.body() as {
        data: { items: Array<{ id: number; ipAddress: string | null }>; meta: { total: number } }
      }
    ).data
    assert.deepEqual(
      searchItems.items.map((item) => ({ id: item.id, ipAddress: item.ipAddress })),
      [{ id: searchableLog.id, ipAddress: searchIp }]
    )
    assert.equal(searchItems.meta.total, 1)
  })

  test('refuses to delete a role that still owns permission grants', async ({ client, assert }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const admin = await User.create({
      fullName: 'Role delete admin',
      email: `role-delete-admin-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await admin.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(admin)
    const role = await Role.create({ code: `granted-role-${Date.now()}`, name: 'Granted role' })
    const permission = await Permission.findByOrFail('code', 'dashboard:view')
    await role.related('permissions').sync([permission.id])

    const response = await client
      .delete(`/api/v1/system/roles/${role.id}`)
      .bearerToken(token.value!.release())

    response.assertStatus(409)
    assert.isNotNull(await Role.find(role.id))
  })

  test('searches and filters paginated management lists on the server', async ({
    client,
    assert,
  }) => {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const admin = await User.create({
      fullName: 'Search admin',
      email: `search-admin-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await admin.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(admin)
    const bearerToken = token.value!.release()
    const searchId = String(Date.now())
    const user = await User.create({
      fullName: 'Search target',
      email: `search-target-${searchId}@example.com`,
      password: generateInitialPassword(),
    })
    const role = await Role.create({ code: `search-role-${searchId}`, name: 'Search role' })
    const permission = await Permission.create({
      code: `search-permission-${searchId}:read`,
      name: 'Search permission',
      groupName: `Search group ${searchId}`,
    })
    await role.related('permissions').sync([permission.id])

    const userResponse = await client
      .get(`/api/v1/system/users?search=${encodeURIComponent(searchId)}`)
      .bearerToken(bearerToken)
    userResponse.assertStatus(200)
    const userItems = (userResponse.body() as { data: { items: Array<{ id: number }> } }).data.items
    assert.isTrue(userItems.some((item) => item.id === user.id))

    const roleResponse = await client
      .get(`/api/v1/system/roles?search=${encodeURIComponent(searchId)}`)
      .bearerToken(bearerToken)
    roleResponse.assertStatus(200)
    const roleItems = (roleResponse.body() as { data: { items: Array<{ id: number }> } }).data.items
    assert.isTrue(roleItems.some((item) => item.id === role.id))

    const permissionResponse = await client
      .get(
        `/api/v1/system/permissions?search=${encodeURIComponent(searchId)}&groupName=${encodeURIComponent(permission.groupName)}`
      )
      .bearerToken(bearerToken)
    permissionResponse.assertStatus(200)
    const permissionItems = (
      permissionResponse.body() as {
        data: {
          items: Array<{
            id: number
            roles: Array<{ id: number; code: string; name: string }>
          }>
        }
      }
    ).data.items
    const permissionItem = permissionItems.find((item) => item.id === permission.id)
    assert.exists(permissionItem)
    assert.deepEqual(permissionItem?.roles, [{ id: role.id, code: role.code, name: role.name }])
  })
})
