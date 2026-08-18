import { test } from '@japa/runner'

import { isStrongPassword, passwordContext } from '#security/password_strength'

test.group('password strength', () => {
  test('rejects common composition passwords', ({ assert }) => {
    assert.isFalse(isStrongPassword('Password123!@#'))
  })

  test('requires mixed password composition', ({ assert }) => {
    assert.isFalse(isStrongPassword('rugged-velvet-harbor-9281-quartz'))
    assert.isFalse(isStrongPassword('RUGGED-VELVET-HARBOR-9281-QUARTZ'))
    assert.isFalse(isStrongPassword('Rugged-Velvet-Harbor-Quartz!'))
    assert.isFalse(isStrongPassword('RuggedVelvetHarbor9281Quartz'))
  })

  test('accepts high entropy passwords', ({ assert }) => {
    assert.isTrue(isStrongPassword('Rugged-Velvet-Harbor-9281-Quartz'))
  })

  test('penalizes account and product context', ({ assert }) => {
    assert.isFalse(
      isStrongPassword('Admin 2026!', passwordContext(['admin@example.local', 'Admin']))
    )
  })

  test('rejects blocklisted defaults', ({ assert }) => {
    assert.isFalse(isStrongPassword('change_this_password'))
  })
})
