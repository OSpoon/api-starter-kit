import { test } from '@japa/runner'

import Permission from '#models/permission'

test.group('permission grouping', () => {
  test('groups permissions under the product navigation groups', async ({ assert }) => {
    const permissions = await Permission.query()
      .whereIn('code', ['knowledge:read', 'knowledge:manage'])
      .orderBy('code')

    assert.lengthOf(permissions, 2)
    assert.deepEqual(
      permissions.map((permission) => permission.groupName),
      ['AI管理', 'AI管理']
    )
  })
})
