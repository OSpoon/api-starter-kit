import { test } from '@japa/runner'

import { buildMyAccessDiagnosis } from '#ai/diagnostics/ai_access_diagnostic'

test.group('AI access diagnosis', () => {
  test('returns only the current user access facts needed for a permission check', ({ assert }) => {
    const result = buildMyAccessDiagnosis(
      [
        {
          code: 'operations-admin',
          name: 'Operations admin',
          permissions: ['api-keys:read', 'api-keys:create'],
        },
      ],
      'api-keys:create'
    )

    assert.deepEqual(result, {
      roles: [{ code: 'operations-admin', name: 'Operations admin' }],
      effectivePermissions: ['api-keys:create', 'api-keys:read'],
      requestedPermission: { code: 'api-keys:create', granted: true },
    })
  })

  test('uses the protected super-admin role without exposing the role permission catalog', ({
    assert,
  }) => {
    const result = buildMyAccessDiagnosis(
      [{ code: 'super-admin', name: 'Super admin', permissions: [] }],
      'users:delete'
    )

    assert.deepEqual(result.effectivePermissions, ['*'])
    assert.deepEqual(result.requestedPermission, { code: 'users:delete', granted: true })
  })
})
