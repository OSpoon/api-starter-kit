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
    const body = response.body() as unknown as Array<{ id: number; roles?: unknown[] }>
    const listedUser = body.find((item) => item.id === user.id)
    assert.isArray(listedUser?.roles)
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

    const auditLog = await AuditLog.query().where('action', 'permission.created').firstOrFail()
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
})
