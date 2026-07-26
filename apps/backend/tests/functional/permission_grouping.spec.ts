import { test } from '@japa/runner'

import Permission from '#models/permission'

test.group('permission grouping', () => {
  test('groups knowledge permissions under system management', async ({ assert }) => {
    const permissions = await Permission.query()
      .whereIn('code', ['knowledge:read', 'knowledge:manage'])
      .orderBy('code')

    assert.lengthOf(permissions, 2)
    assert.deepEqual(
      permissions.map((permission) => permission.groupName),
      ['系统管理', '系统管理']
    )
  })
})
