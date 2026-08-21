import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

import ChannelIdentity from '#models/channel_identity'
import User from '#models/user'
import {
  bindChannelIdentity,
  findActiveChannelIdentity,
  revokeChannelIdentity,
} from '#services/channel_identity_service'

test.group('channel identity binding', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('binds and resolves an external identity for the existing system user', async ({
    assert,
  }) => {
    const user = await User.create({
      email: `channel-identity-${Date.now()}@example.com`,
      password: 'Harbor-Violet-Quartz-9821!',
    })

    const identity = await bindChannelIdentity({
      channel: 'wecom',
      externalTenantId: 'corp-1',
      externalUserId: 'zhangsan',
      userId: user.id,
    })
    const resolved = await findActiveChannelIdentity({
      channel: 'wecom',
      externalTenantId: 'corp-1',
      externalUserId: 'zhangsan',
    })

    assert.equal(identity.userId, user.id)
    assert.equal(resolved?.userId, user.id)
    assert.equal(resolved?.status, 'active')
  })

  test('rejects binding an active channel identity to a different user', async ({ assert }) => {
    const firstUser = await User.create({
      email: `channel-first-${Date.now()}@example.com`,
      password: 'Harbor-Violet-Quartz-9821!',
    })
    const secondUser = await User.create({
      email: `channel-second-${Date.now()}@example.com`,
      password: 'Harbor-Violet-Quartz-9821!',
    })

    await bindChannelIdentity({
      channel: 'feishu',
      externalTenantId: 'tenant-1',
      externalUserId: 'open-id-1',
      userId: firstUser.id,
    })

    await assert.rejects(
      () =>
        bindChannelIdentity({
          channel: 'feishu',
          externalTenantId: 'tenant-1',
          externalUserId: 'open-id-1',
          userId: secondUser.id,
        }),
      'This channel identity is already bound to another user'
    )
  })

  test('revoked identities are not resolved and can be rebound by the same user', async ({
    assert,
  }) => {
    const user = await User.create({
      email: `channel-revoke-${Date.now()}@example.com`,
      password: 'Harbor-Violet-Quartz-9821!',
    })
    const identity = await bindChannelIdentity({
      channel: 'wecom',
      externalTenantId: 'corp-2',
      externalUserId: 'lisi',
      userId: user.id,
    })

    await revokeChannelIdentity(identity)
    assert.isNull(
      await findActiveChannelIdentity({
        channel: 'wecom',
        externalTenantId: 'corp-2',
        externalUserId: 'lisi',
      })
    )

    const rebound = await bindChannelIdentity({
      channel: 'wecom',
      externalTenantId: 'corp-2',
      externalUserId: 'lisi',
      userId: user.id,
    })
    assert.equal(rebound.id, identity.id)
    assert.equal(rebound.status, 'active')
    assert.isNull(rebound.revokedAt)

    assert.equal(
      await ChannelIdentity.query()
        .where('user_id', user.id)
        .count('* as total')
        .then((rows) => Number(rows[0].$extras.total)),
      1
    )
  })
})
