import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeServerOrigin, ServerUrlError } from '../src/lib/server-url.ts'

test('normalizes a secure server origin', () => {
  assert.equal(normalizeServerOrigin('  https://api.example.com/  '), 'https://api.example.com')
  assert.equal(
    normalizeServerOrigin('https://api.example.com:8443'),
    'https://api.example.com:8443'
  )
})

test('allows HTTP only for loopback development servers', () => {
  assert.equal(normalizeServerOrigin('http://localhost:13333'), 'http://localhost:13333')
  assert.equal(normalizeServerOrigin('http://127.0.0.1:13333'), 'http://127.0.0.1:13333')
  assert.equal(normalizeServerOrigin('http://[::1]:13333'), 'http://[::1]:13333')
})

test('rejects non-HTTPS remote origins', () => {
  assert.throws(
    () => normalizeServerOrigin('http://api.example.com'),
    (error) => {
      assert.ok(error instanceof ServerUrlError)
      assert.equal(error.code, 'https_required')
      return true
    }
  )
})

test('rejects credentials, paths, query strings, fragments, and invalid values', () => {
  for (const value of [
    'https://user:password@api.example.com',
    'https://api.example.com/backend',
    'https://api.example.com?tenant=one',
    'https://api.example.com#api',
    'not a URL',
    '',
  ]) {
    assert.throws(() => normalizeServerOrigin(value), ServerUrlError)
  }
})
