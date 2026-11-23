import { readFile } from 'node:fs/promises'

import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import Permission from '#models/permission'
import Role from '#models/role'
import { permissionCatalog } from '#services/permission_catalog'

test.group('permission catalog', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('matches seeded system permissions and every route permission', async ({ assert }) => {
    const databaseCodes = await Permission.query().where('is_system', true).select('code')
    assert.sameMembers(
      databaseCodes.map((permission) => permission.code),
      permissionCatalog.map((permission) => permission.code)
    )

    const sources = await Promise.all(
      [
        new URL('../../start/routes.ts', import.meta.url),
        new URL('../../../frontend/src/router/modules/workbench.ts', import.meta.url),
      ].map((url) => readFile(url, 'utf8'))
    )
    const routeCodes = new Set(
      sources.flatMap((source) =>
        [...source.matchAll(/['"]([a-z0-9-]+:[a-z0-9-]+)['"]/g)].map((match) => match[1]!)
      )
    )
    assert.sameMembers(
      permissionCatalog.map((permission) => permission.code),
      [...routeCodes]
    )
  })

  test('grants backend log access to admin roles when present', async ({ assert }) => {
    const permission = await Permission.findByOrFail('code', 'backend-logs:read')
    const roles = await Role.query()
      .whereIn('code', ['admin', 'super-admin'])
      .preload('permissions')

    assert.include(
      roles.map((role) => role.code),
      'super-admin'
    )
    for (const role of roles) {
      assert.include(
        role.permissions.map((item) => item.id),
        permission.id
      )
    }
  })

  test('groups permissions by current menu and removes retired permission codes', async ({
    assert,
  }) => {
    const retiredPermissions = await Permission.query()
      .whereIn('code', [
        'agent-mcp:execute',
        'llm-config:read',
        'llm-config:update',
        'llm-config:test',
        'todo-board:read',
      ])
      .select('code')

    assert.isEmpty(retiredPermissions)
    assert.notInclude(
      permissionCatalog.map(({ code }) => code),
      'todo-board:read'
    )
    assert.deepEqual(
      Object.fromEntries(
        ['工作台', '系统管理', '权限管理', 'Agent管理'].map((groupName) => [
          groupName,
          permissionCatalog
            .filter((permission) => permission.groupName === groupName)
            .map((permission) => permission.code)
            .sort(),
        ])
      ),
      {
        工作台: ['dashboard:view'],
        系统管理: [
          'api-keys:create',
          'api-keys:delete',
          'api-keys:read',
          'api-keys:update',
          'audit-logs:read',
          'backend-logs:read',
          'system-status:read',
        ],
        权限管理: [
          'permissions:read',
          'roles:create',
          'roles:delete',
          'roles:read',
          'roles:update',
          'users:create',
          'users:delete',
          'users:read',
          'users:update',
        ],
        Agent管理: [
          'agent-config:read',
          'agent-config:update',
          'ai-evaluations:manage',
          'ai-evaluations:read',
          'ai-evaluations:run',
          'ai-usage:read',
          'im-config:read',
          'im-config:update',
          'knowledge:manage',
          'knowledge:read',
        ],
      }
    )
    assert.notInclude(
      permissionCatalog.map(({ code }) => code),
      'llm-config:read'
    )
    assert.notInclude(
      permissionCatalog.map(({ code }) => code),
      'llm-config:update'
    )
    assert.notInclude(
      permissionCatalog.map(({ code }) => code),
      'llm-config:test'
    )
  })

  test('grants evaluation access to the protected super-admin role', async ({ assert }) => {
    const permissions = await Permission.query()
      .whereIn('code', ['ai-evaluations:read', 'ai-evaluations:manage', 'ai-evaluations:run'])
      .select('id', 'code')
    const superAdmin = await Role.query()
      .where('code', 'super-admin')
      .preload('permissions')
      .firstOrFail()

    assert.lengthOf(permissions, 3)
    assert.includeMembers(
      superAdmin.permissions.map((permission) => permission.id),
      permissions.map((permission) => permission.id)
    )
  })
})
