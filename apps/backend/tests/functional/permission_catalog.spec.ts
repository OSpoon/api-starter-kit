import { readFile } from 'node:fs/promises'

import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import Permission from '#models/permission'
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

  test('groups permissions by current menu and removes retired permission codes', async ({
    assert,
  }) => {
    const retiredPermissions = await Permission.query()
      .whereIn('code', [
        'im-config:read',
        'im-config:update',
        'agent-mcp:execute',
        'llm-config:read',
        'llm-config:update',
        'llm-config:test',
      ])
      .select('code')

    assert.isEmpty(retiredPermissions)
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
          'system-status:read',
          'wecom-templates:create',
          'wecom-templates:delete',
          'wecom-templates:read',
          'wecom-templates:send',
          'wecom-templates:test',
          'wecom-templates:update',
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
          'ai-usage:read',
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
})
