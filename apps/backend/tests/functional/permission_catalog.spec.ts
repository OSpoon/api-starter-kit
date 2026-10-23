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
    assert.includeMembers(
      permissionCatalog.map((permission) => permission.code),
      [...routeCodes]
    )
  })
})
