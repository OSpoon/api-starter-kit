import { Bouncer } from '@adonisjs/bouncer'
import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import { access } from '#abilities/main'
import AuditLog from '#models/audit_log'
import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#services/user_credentials'

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
      permissionResponse.body() as { data: { items: Array<{ id: number }> } }
    ).data.items
    assert.isTrue(permissionItems.some((item) => item.id === permission.id))
  })
})
