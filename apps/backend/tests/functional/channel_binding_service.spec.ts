import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'

import ChannelIdentity from '#models/channel_identity'
import User from '#models/user'
import {
  consumeChannelBindingChallenge,
  createChannelBindingChallenge,
} from '#services/channel_binding_service'
import { findActiveChannelIdentity } from '#services/channel_identity_service'

test.group('channel binding challenges', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('creates a one-time code and binds it to the authenticated system user', async ({
    assert,
  }) => {
    const user = await User.create({
      email: `channel-bind-${Date.now()}@example.com`,
      password: 'Harbor-Violet-Quartz-9821!',
    })
    const challenge = await createChannelBindingChallenge({
      channel: 'wecom',
      externalTenantId: 'corp-bind-1',
      externalUserId: 'user-bind-1',
    })

    assert.isNotNull(challenge)
    const identity = await consumeChannelBindingChallenge({
      code: challenge!.code,
      userId: user.id,
    })
    assert.equal(identity.userId, user.id)
    assert.isNotNull(
      await findActiveChannelIdentity({
        channel: 'wecom',
        externalTenantId: 'corp-bind-1',
        externalUserId: 'user-bind-1',
      })
    )
  })

  test('does not allow a binding code to be consumed twice', async ({ assert }) => {
    const user = await User.create({
      email: `channel-bind-once-${Date.now()}@example.com`,
      password: 'Harbor-Violet-Quartz-9821!',
    })
    const challenge = await createChannelBindingChallenge({
      channel: 'feishu',
      externalTenantId: 'tenant-bind-1',
      externalUserId: 'open-id-bind-1',
    })

    await consumeChannelBindingChallenge({ code: challenge!.code, userId: user.id })
    await assert.rejects(
      () => consumeChannelBindingChallenge({ code: challenge!.code, userId: user.id }),
      '绑定码无效或已过期'
    )
  })

  test('rotates an active code when the user requests another one', async ({ assert }) => {
    const input = {
      channel: 'feishu' as const,
      externalTenantId: 'tenant-bind-rotate',
      externalUserId: 'open-id-bind-rotate',
    }
    const first = await createChannelBindingChallenge(input)
    const second = await createChannelBindingChallenge(input)

    assert.notEqual(first!.code, second!.code)
    await assert.rejects(
      () => consumeChannelBindingChallenge({ code: first!.code, userId: 1 }),
      '绑定码无效或已过期'
    )
  })

  test('binds through the authenticated account API', async ({ client, assert }) => {
    const user = await User.create({
      email: `channel-bind-api-${Date.now()}@example.com`,
      password: 'Harbor-Violet-Quartz-9821!',
    })
    const token = await User.accessTokens.create(user)
    const challenge = await createChannelBindingChallenge({
      channel: 'wecom',
      externalTenantId: 'corp-bind-api',
      externalUserId: 'user-bind-api',
    })

    const response = await client
      .post('/api/v1/account/channel-identities/bind')
      .bearerToken(token.value!.release())
      .json({ code: challenge!.code })

    response.assertStatus(200)
    assert.equal(response.body().data.bound, true)
    assert.equal(response.body().data.channel, 'wecom')
  })

  test('unbinds the current user WeCom identity after password confirmation', async ({
    client,
    assert,
  }) => {
    const user = await User.create({
      email: `channel-unbind-api-${Date.now()}@example.com`,
      password: 'Harbor-Violet-Quartz-9821!',
    })
    const token = await User.accessTokens.create(user)
    await ChannelIdentity.create({
      channel: 'wecom',
      externalTenantId: 'corp-unbind-api',
      externalUserId: 'user-unbind-api',
      userId: user.id,
      status: 'active',
      boundAt: DateTime.utc(),
    })

    const tokenValue = token.value!.release()
    const rejected = await client
      .post('/api/v1/account/channel-identities/wecom/unbind')
      .bearerToken(tokenValue)
      .json({ password: 'wrong-password' })
    rejected.assertStatus(400)

    const response = await client
      .post('/api/v1/account/channel-identities/wecom/unbind')
      .bearerToken(tokenValue)
      .json({ password: 'Harbor-Violet-Quartz-9821!' })

    response.assertStatus(200)
    assert.equal(response.body().data.unbound, true)
    assert.equal(
      await ChannelIdentity.query().where('user_id', user.id).where('status', 'active').first(),
      null
    )
  })
})
