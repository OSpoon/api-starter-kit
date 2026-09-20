import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import ApiKey from '#models/api_key'
import AuditLog from '#models/audit_log'
import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'
import { hashApiKey } from '#services/api_key_service'

test.group('api keys', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  async function createAdmin() {
    const superAdminRole = await Role.findByOrFail('code', 'super-admin')
    const user = await User.create({
      fullName: 'API Key Admin',
      email: `apikey-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([superAdminRole.id])
    const token = await User.accessTokens.create(user)
    return { user, bearerToken: token.value!.release() }
  }

  test('creates an api key and returns the secret once', async ({ client, assert }) => {
    const { user, bearerToken } = await createAdmin()

    const response = await client
      .post('/api/v1/api-keys')
      .bearerToken(bearerToken)
      .json({ name: 'Test key', expiresIn: '30d' })

    response.assertStatus(200)
    const body = response.body().data as { id: number; name: string; key: string; prefix: string }
    assert.equal(body.name, 'Test key')
    assert.isString(body.key)
    assert.isString(body.prefix)
    assert.isTrue(body.key.startsWith('id_'))

    const stored = await ApiKey.find(body.id)
    assert.isNotNull(stored)
    assert.notEqual(stored!.keyHash, body.key)
    assert.isNotNull(stored!.expiresAt)
    const audit = await AuditLog.query()
      .where('action', 'api_key.created')
      .where('actorUserId', user.id)
      .where('targetId', String(body.id))
      .firstOrFail()
    assert.deepEqual(audit.metadata, { name: body.name, prefix: body.prefix, source: 'api' })
  })

  test('lists api keys without exposing the secret', async ({ client, assert }) => {
    const { bearerToken } = await createAdmin()

    await client.post('/api/v1/api-keys').bearerToken(bearerToken).json({ name: 'Key A' })
    await client.post('/api/v1/api-keys').bearerToken(bearerToken).json({ name: 'Key B' })

    const response = await client.get('/api/v1/api-keys').bearerToken(bearerToken)

    response.assertStatus(200)
    const body = response.body().data as { items: Array<{ name: string; prefix: string }> }
    assert.isAtLeast(body.items.length, 2)
    for (const item of body.items) {
      assert.isString(item.prefix)
      assert.isUndefined((item as Record<string, unknown>).key)
    }

    const emptySearchResponse = await client
      .get('/api/v1/api-keys?search=%20%20')
      .bearerToken(bearerToken)
    emptySearchResponse.assertStatus(200)
    assert.equal(
      (emptySearchResponse.body().data as { items: unknown[] }).items.length,
      body.items.length
    )
  })

  test('searches api keys on the server before pagination and validates query parameters', async ({
    client,
    assert,
  }) => {
    const { bearerToken } = await createAdmin()
    const searchId = String(Date.now())
    const matchName = `Search match ${searchId}`
    const match = await client
      .post('/api/v1/api-keys')
      .bearerToken(bearerToken)
      .json({ name: matchName })
    match.assertStatus(200)
    const matchId = (match.body().data as { id: number }).id

    const nonMatch = await client
      .post('/api/v1/api-keys')
      .bearerToken(bearerToken)
      .json({ name: 'Other key' })
    nonMatch.assertStatus(200)

    const response = await client
      .get(`/api/v1/api-keys?search=${encodeURIComponent(searchId.toLowerCase())}&page=1&limit=1`)
      .bearerToken(bearerToken)
    response.assertStatus(200)
    const body = response.body().data as {
      items: Array<{ id: number; name: string }>
      meta: { total: number }
    }
    assert.deepEqual(
      body.items.map((item) => item.id),
      [matchId]
    )
    assert.equal(body.meta.total, 1)

    const invalidQuery = await client.get('/api/v1/api-keys?page=1.5').bearerToken(bearerToken)
    invalidQuery.assertStatus(422)
  })

  test('updates an api key name without regenerating the secret', async ({ client, assert }) => {
    const { user, bearerToken } = await createAdmin()

    const create = await client
      .post('/api/v1/api-keys')
      .bearerToken(bearerToken)
      .json({ name: 'Original' })
    const id = (create.body().data as { id: number }).id
    const originalKey = (create.body().data as { key: string }).key

    const update = await client
      .put(`/api/v1/api-keys/${id}`)
      .bearerToken(bearerToken)
      .json({ name: 'Renamed' })

    update.assertStatus(200)
    const updateBody = update.body().data as { name: string }
    assert.equal(updateBody.name, 'Renamed')

    const stored = await ApiKey.find(id)
    assert.equal(stored!.name, 'Renamed')
    // Hash should not change
    assert.equal(stored!.keyHash, hashApiKey(originalKey))
    const audit = await AuditLog.query()
      .where('action', 'api_key.updated')
      .where('actorUserId', user.id)
      .where('targetId', String(id))
      .firstOrFail()
    assert.deepEqual(audit.metadata, {
      name: 'Renamed',
      prefix: stored!.prefix,
      source: 'api',
    })
  })

  test('revokes an api key on first delete then physically removes on second', async ({
    client,
    assert,
  }) => {
    const { user, bearerToken } = await createAdmin()

    const create = await client
      .post('/api/v1/api-keys')
      .bearerToken(bearerToken)
      .json({ name: 'To revoke' })
    const id = (create.body().data as { id: number }).id

    const firstDelete = await client.delete(`/api/v1/api-keys/${id}`).bearerToken(bearerToken)
    firstDelete.assertStatus(200)
    const revoked = await ApiKey.find(id)
    assert.isNotNull(revoked)
    assert.isNotNull(revoked!.revokedAt)
    assert.exists(
      await AuditLog.query()
        .where('action', 'api_key.revoked')
        .where('actorUserId', user.id)
        .where('targetId', String(id))
        .first()
    )

    const secondDelete = await client.delete(`/api/v1/api-keys/${id}`).bearerToken(bearerToken)
    secondDelete.assertStatus(200)
    assert.isNull(await ApiKey.find(id))
    assert.exists(
      await AuditLog.query()
        .where('action', 'api_key.deleted')
        .where('actorUserId', user.id)
        .where('targetId', String(id))
        .first()
    )
  })

  test('denies api key access without authentication', async ({ client }) => {
    const response = await client.get('/api/v1/api-keys')
    response.assertStatus(401)
  })

  test('denies api key management without permission', async ({ client }) => {
    const user = await User.create({
      fullName: 'No perm user',
      email: `noperm-${Date.now()}@example.com`,
      password: generateInitialPassword(),
    })
    const token = await User.accessTokens.create(user)

    const response = await client.get('/api/v1/api-keys').bearerToken(token.value!.release())
    response.assertStatus(403)
  })
})
