import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import { resetThrottleBuckets, setThrottleEnabled } from '#middleware/throttle_middleware'
import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#services/user_credentials'

test.group('throttle middleware', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  group.each.setup(() => {
    setThrottleEnabled(true)
    resetThrottleBuckets()
    return () => {
      setThrottleEnabled(false)
      resetThrottleBuckets()
    }
  })

  async function createAdmin() {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'Throttle Admin',
      email: `throttle-${Date.now()}-${Math.random()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(user)
    return { user, bearerToken: token.value!.release() }
  }

  test('returns 429 when auth login rate limit is exceeded', async ({ client, assert }) => {
    const email = `limit-${Date.now()}@example.com`
    const password = 'Rugged-Velvet-Harbor-9281-Quartz'

    await User.create({ fullName: 'Limit User', email, password })

    // The auth login route allows 10 requests per minute per IP.
    // Send 10 requests that should succeed (even with wrong credentials),
    // then verify the 11th is throttled.
    for (let i = 0; i < 10; i++) {
      const res = await client.post('/api/v1/auth/login').json({
        email: `wrong-${i}@example.com`,
        password: 'wrong',
      })
      assert.notEqual(res.status(), 429)
    }

    const blocked = await client.post('/api/v1/auth/login').json({
      email: 'blocked@example.com',
      password: 'wrong',
    })

    blocked.assertStatus(429)
    blocked.assertBodyContains({ code: 'E_RATE_LIMIT_EXCEEDED' })
    // Window is 60 seconds; after 10 rapid requests the oldest timestamp
    // is essentially "now", so retry-after is the full window.
    const retryAfter = Number(blocked.header('Retry-After'))
    assert.isAtLeast(retryAfter, 1)
    assert.isAtMost(retryAfter, 60)
    assert.equal(blocked.header('X-RateLimit-Remaining'), '0')
  })

  test('sets X-RateLimit headers on allowed requests', async ({ client, assert }) => {
    const { bearerToken } = await createAdmin()

    const res = await client.get('/api/v1/account/profile').bearerToken(bearerToken)

    // The account route allows 30 requests per minute per user.
    assert.isNotOk(res.status() === 429)
    assert.equal(res.header('X-RateLimit-Limit'), '30')
    assert.equal(res.header('X-RateLimit-Remaining'), '29')
  })
})
