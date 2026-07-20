import crypto from 'node:crypto'

import { DateTime } from 'luxon'

import ApiKey from '#models/api_key'

export function hashApiKey(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export function resolveExpiresAt(payload: {
  expiresAt?: string | null
  expiresIn?: string | null
}) {
  if (payload.expiresAt) {
    return DateTime.fromISO(payload.expiresAt)
  }

  const durationDays: Record<string, number> = {
    '30d': 30,
    '90d': 90,
    '180d': 180,
  }

  if (payload.expiresIn === 'long') {
    return null
  }

  if (payload.expiresIn && payload.expiresIn in durationDays) {
    return DateTime.now().plus({ days: durationDays[payload.expiresIn]! })
  }

  return null
}

export function serializeApiKey(key: ApiKey) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  }
}

export async function authenticateApiKey(raw: string | null | undefined) {
  if (!raw?.trim()) {
    return null
  }

  const apiKey = await ApiKey.query().where('key_hash', hashApiKey(raw)).first()
  if (!apiKey || apiKey.revokedAt || (apiKey.expiresAt && apiKey.expiresAt <= DateTime.now())) {
    return null
  }

  apiKey.lastUsedAt = DateTime.now()
  await apiKey.save()
  return apiKey
}

export async function createApiKey(payload: {
  name: string
  expiresAt?: string | null
  expiresIn?: string | null
}) {
  const secret = `id_${crypto.randomBytes(32).toString('base64url')}`
  const prefix = secret.slice(0, 12)
  const apiKey = await ApiKey.create({
    name: payload.name,
    prefix,
    keyHash: hashApiKey(secret),
    expiresAt: resolveExpiresAt(payload),
  })

  return { apiKey, secret }
}
