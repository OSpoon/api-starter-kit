import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import ApiKey from '#models/api_key'
import Role from '#models/role'
import User from '#models/user'
import { hashApiKey } from '#services/api_key_service'
import { generateInitialPassword } from '#services/user_credentials'

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
    const { bearerToken } = await createAdmin()

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
  })

  test('updates an api key name without regenerating the secret', async ({ client, assert }) => {
    const { bearerToken } = await createAdmin()

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
  })

  test('revokes an api key on first delete then physically removes on second', async ({
    client,
    assert,
  }) => {
    const { bearerToken } = await createAdmin()

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

    const secondDelete = await client.delete(`/api/v1/api-keys/${id}`).bearerToken(bearerToken)
    secondDelete.assertStatus(200)
    assert.isNull(await ApiKey.find(id))
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
