import assert from 'node:assert/strict'

import { moveAccount, orderAccounts } from '../src/features/authenticator/services/account-order.ts'
import {
  decodeBase32,
  generateTotpCode,
  parseOtpAuthUri,
} from '../src/features/authenticator/services/totp.ts'

const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
const account = {
  id: 'rfc-6238',
  issuer: 'RFC',
  name: 'Test',
  secret,
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
}

assert.equal(Buffer.from(decodeBase32(secret)).toString(), '12345678901234567890')
assert.equal(await generateTotpCode(account, 59_000), '287082')
assert.deepEqual(
  parseOtpAuthUri(`otpauth://totp/Example:alice%40example.com?secret=${secret}&issuer=Example`),
  {
    issuer: 'Example',
    name: 'alice@example.com',
    secret,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  }
)

const accounts = [
  { ...account, id: 'z', issuer: 'Zeta', name: 'z@work' },
  { ...account, id: 'b', issuer: 'Beta', name: 'b@work' },
  { ...account, id: 'a', issuer: 'Alpha', name: 'a@work' },
]

assert.deepEqual(
  orderAccounts(accounts, 'manual', 'en').map(({ id }) => id),
  ['z', 'b', 'a']
)
assert.deepEqual(
  orderAccounts(accounts, 'ascending', 'en').map(({ id }) => id),
  ['a', 'b', 'z']
)
assert.deepEqual(
  orderAccounts(accounts, 'descending', 'en').map(({ id }) => id),
  ['z', 'b', 'a']
)
assert.deepEqual(
  moveAccount(accounts, 'b', -1).map(({ id }) => id),
  ['b', 'z', 'a']
)
assert.equal(moveAccount(accounts, 'z', -1), accounts)

console.log('TOTP RFC 6238, otpauth URI, and account ordering checks passed')
