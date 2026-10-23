import encryption from '@adonisjs/core/services/encryption'
import { test } from '@japa/runner'

import {
  decryptRecoveryCodes,
  decryptTwoFactorSecret,
  encryptRecoveryCodes,
  encryptTwoFactorSecret,
} from '#security/two_factor_secret_store'

test.group('two-factor secret store', () => {
  test('round-trips encrypted secrets and recovery codes', ({ assert }) => {
    const secret = encryptTwoFactorSecret('TESTSECRET')
    const recoveryCodes = encryptRecoveryCodes(['first-code', 'second-code'])

    assert.equal(decryptTwoFactorSecret(secret), 'TESTSECRET')
    assert.deepEqual(decryptRecoveryCodes(recoveryCodes), ['first-code', 'second-code'])
  })

  test('rejects plaintext, invalid ciphertext, and malformed recovery-code payloads', ({
    assert,
  }) => {
    assert.throws(() => decryptTwoFactorSecret('plaintext-secret'))
    assert.throws(() => decryptRecoveryCodes('plaintext-codes'))
    assert.throws(() => decryptRecoveryCodes(encryption.encrypt('{')))
    assert.throws(() => decryptRecoveryCodes(encryption.encrypt(JSON.stringify(['valid', 1]))))
  })
})
