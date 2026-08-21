import { DateTime } from 'luxon'

import ChannelIdentity, {
  type ChannelIdentityStatus,
  type ChannelName,
} from '#models/channel_identity'

export class ChannelIdentityBindingError extends Error {
  code = 'E_CHANNEL_IDENTITY_BINDING'

  constructor(message: string) {
    super(message)
    this.name = 'ChannelIdentityBindingError'
  }
}

function required(value: string, field: string) {
  const normalized = value.trim()
  if (!normalized) throw new ChannelIdentityBindingError(`${field} is required`)
  return normalized
}

export async function findActiveChannelIdentity(input: {
  channel: ChannelName
  externalTenantId: string
  externalUserId: string
}) {
  return ChannelIdentity.query()
    .where('channel', input.channel)
    .where('external_tenant_id', required(input.externalTenantId, 'externalTenantId'))
    .where('external_user_id', required(input.externalUserId, 'externalUserId'))
    .where('status', 'active')
    .first()
}

export async function bindChannelIdentity(input: {
  channel: ChannelName
  externalTenantId: string
  externalUserId: string
  userId: number
}) {
  const externalTenantId = required(input.externalTenantId, 'externalTenantId')
  const externalUserId = required(input.externalUserId, 'externalUserId')
  const existing = await ChannelIdentity.query()
    .where('channel', input.channel)
    .where('external_tenant_id', externalTenantId)
    .where('external_user_id', externalUserId)
    .first()

  if (existing && existing.userId !== input.userId && existing.status === 'active') {
    throw new ChannelIdentityBindingError('This channel identity is already bound to another user')
  }

  if (existing) {
    existing.merge({
      userId: input.userId,
      status: 'active' satisfies ChannelIdentityStatus,
      boundAt: DateTime.utc(),
      revokedAt: null,
    })
    await existing.save()
    return existing
  }

  return ChannelIdentity.create({
    channel: input.channel,
    externalTenantId,
    externalUserId,
    userId: input.userId,
    status: 'active',
    boundAt: DateTime.utc(),
  })
}

export async function revokeChannelIdentity(identity: ChannelIdentity) {
  identity.merge({ status: 'revoked', revokedAt: DateTime.utc() })
  await identity.save()
  return identity
}
