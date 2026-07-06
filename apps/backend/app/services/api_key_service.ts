import crypto from 'node:crypto'

import encryption from '@adonisjs/core/services/encryption'
import { DateTime } from 'luxon'

import ApiKey from '#models/api_key'

export function hashApiKey(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export function decryptStoredKey(value: string | null) {
  if (!value) {
    return null
  }

  try {
    return encryption.decrypt<string>(value)
  } catch {
    return null
  }
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

export function serializeApiKey(key: ApiKey, options?: { includeSecret?: boolean }) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    key: options?.includeSecret ? decryptStoredKey(key.keyEncrypted) : undefined,
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
    keyEncrypted: encryption.encrypt(secret),
    expiresAt: resolveExpiresAt(payload),
  })

  return { apiKey, secret }
}
