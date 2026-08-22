import crypto from 'node:crypto'

import { DateTime } from 'luxon'

import ChannelBindingChallenge from '#models/channel_binding_challenge'
import type { ChannelName } from '#models/channel_identity'
import { bindChannelIdentity } from '#services/channel_identity_service'

const CHALLENGE_TTL_MINUTES = 10

export class ChannelBindingError extends Error {
  code = 'E_CHANNEL_BINDING'
  status: 404 | 409 | 422

  constructor(message: string, status: 404 | 409 | 422 = 422) {
    super(message)
    this.name = 'ChannelBindingError'
    this.status = status
  }
}

function hashCode(code: string) {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex')
}

export async function createChannelBindingChallenge(input: {
  channel: ChannelName
  externalTenantId: string
  externalUserId: string
}) {
  await ChannelBindingChallenge.query()
    .where('channel', input.channel)
    .where('external_tenant_id', input.externalTenantId)
    .where('external_user_id', input.externalUserId)
    .whereNull('used_at')
    .where('expires_at', '<=', DateTime.utc().toSQL()!)
    .update({ usedAt: DateTime.utc() })

  // The plaintext code is intentionally never persisted, so an active
  // challenge cannot be displayed again after the original reply is missed.
  // Rotate it on a new inbound message to give the user a recoverable flow.
  await ChannelBindingChallenge.query()
    .where('channel', input.channel)
    .where('external_tenant_id', input.externalTenantId)
    .where('external_user_id', input.externalUserId)
    .whereNull('used_at')
    .update({ usedAt: DateTime.utc() })

  const code = crypto.randomBytes(4).toString('hex').toUpperCase()
  const challenge = await ChannelBindingChallenge.create({
    channel: input.channel,
    externalTenantId: input.externalTenantId,
    externalUserId: input.externalUserId,
    codeHash: hashCode(code),
    expiresAt: DateTime.utc().plus({ minutes: CHALLENGE_TTL_MINUTES }),
  })
  return { challenge, code }
}

export async function consumeChannelBindingChallenge(input: { code: string; userId: number }) {
  const challenge = await ChannelBindingChallenge.query()
    .where('code_hash', hashCode(input.code))
    .whereNull('used_at')
    .where('expires_at', '>', DateTime.utc().toSQL()!)
    .first()
  if (!challenge) throw new ChannelBindingError('绑定码无效或已过期', 404)

  const claimed = await ChannelBindingChallenge.query()
    .where('id', challenge.id)
    .whereNull('used_at')
    .where('expires_at', '>', DateTime.utc().toSQL()!)
    .update({ usedAt: DateTime.utc() })
  if (claimed[0] !== 1) throw new ChannelBindingError('绑定码已被使用', 409)

  try {
    return await bindChannelIdentity({
      channel: challenge.channel,
      externalTenantId: challenge.externalTenantId,
      externalUserId: challenge.externalUserId,
      userId: input.userId,
    })
  } catch (error) {
    throw new ChannelBindingError(error instanceof Error ? error.message : '无法完成渠道绑定', 409)
  }
}
