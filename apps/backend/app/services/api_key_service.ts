import crypto from 'node:crypto'

import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'

import ApiKey from '#models/api_key'
import { recordAuditEvent } from '#services/audit_log'

export type ApiKeyAuditAction = 'created' | 'updated' | 'revoked' | 'deleted'
export type ApiKeyAuditSource = 'api' | 'ai_agent'

export async function auditApiKeyMutation(
  ctx: HttpContext,
  input: {
    actorUserId: number
    apiKey: ApiKey
    action: ApiKeyAuditAction
    source: ApiKeyAuditSource
  },
  transaction?: TransactionClientContract
) {
  await recordAuditEvent(
    ctx,
    {
      actorUserId: input.actorUserId,
      action: `api_key.${input.action}`,
      targetType: 'api_key',
      targetId: input.apiKey.id,
      metadata: { name: input.apiKey.name, prefix: input.apiKey.prefix, source: input.source },
    },
    transaction
  )
}

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

export async function createApiKey(
  ctx: HttpContext,
  actorUserId: number,
  payload: { name: string; expiresAt?: string | null; expiresIn?: string | null },
  source: ApiKeyAuditSource
) {
  const secret = `id_${crypto.randomBytes(32).toString('base64url')}`
  const prefix = secret.slice(0, 12)
  const apiKey = await db.transaction(async (trx) => {
    const created = await ApiKey.create(
      {
        name: payload.name,
        prefix,
        keyHash: hashApiKey(secret),
        expiresAt: resolveExpiresAt(payload),
      },
      { client: trx }
    )
    await auditApiKeyMutation(ctx, { actorUserId, apiKey: created, action: 'created', source }, trx)
    return created
  })

  return { apiKey, secret }
}

export async function updateApiKey(
  ctx: HttpContext,
  input: {
    actorUserId: number
    apiKeyId: number | string
    payload: { name: string; expiresAt?: string | null; expiresIn?: string | null }
    source: ApiKeyAuditSource
  }
) {
  return db.transaction(async (trx) => {
    const apiKey = await ApiKey.query({ client: trx }).where('id', input.apiKeyId).firstOrFail()
    apiKey.name = input.payload.name
    apiKey.expiresAt = input.payload.expiresAt
      ? DateTime.fromISO(input.payload.expiresAt)
      : resolveExpiresAt(input.payload)
    await apiKey.save()
    await auditApiKeyMutation(
      ctx,
      { actorUserId: input.actorUserId, apiKey, action: 'updated', source: input.source },
      trx
    )
    return apiKey
  })
}

export async function revokeApiKey(
  ctx: HttpContext,
  input: { actorUserId: number; apiKeyId: number | string; source: ApiKeyAuditSource }
) {
  return db.transaction(async (trx) => {
    const apiKey = await ApiKey.query({ client: trx }).where('id', input.apiKeyId).firstOrFail()
    if (apiKey.revokedAt) throw new Error('API Key 已不存在或已被吊销')
    apiKey.revokedAt = DateTime.now()
    await apiKey.save()
    await auditApiKeyMutation(
      ctx,
      { actorUserId: input.actorUserId, apiKey, action: 'revoked', source: input.source },
      trx
    )
    return apiKey
  })
}

export async function deleteRevokedApiKey(
  ctx: HttpContext,
  input: { actorUserId: number; apiKeyId: number | string; source: ApiKeyAuditSource }
) {
  return db.transaction(async (trx) => {
    const apiKey = await ApiKey.query({ client: trx }).where('id', input.apiKeyId).firstOrFail()
    if (!apiKey.revokedAt) throw new Error('API Key 不存在或未被吊销')
    await auditApiKeyMutation(
      ctx,
      { actorUserId: input.actorUserId, apiKey, action: 'deleted', source: input.source },
      trx
    )
    await apiKey.delete()
    return apiKey.id
  })
}

export async function revokeOrDeleteApiKey(
  ctx: HttpContext,
  input: { actorUserId: number; apiKeyId: number | string; source: ApiKeyAuditSource }
) {
  return db.transaction(async (trx) => {
    const apiKey = await ApiKey.query({ client: trx }).where('id', input.apiKeyId).firstOrFail()
    if (apiKey.revokedAt) {
      await auditApiKeyMutation(
        ctx,
        { actorUserId: input.actorUserId, apiKey, action: 'deleted', source: input.source },
        trx
      )
      await apiKey.delete()
      return { deleted: true as const, id: apiKey.id }
    }

    apiKey.revokedAt = DateTime.now()
    await apiKey.save()
    await auditApiKeyMutation(
      ctx,
      { actorUserId: input.actorUserId, apiKey, action: 'revoked', source: input.source },
      trx
    )
    return { deleted: false as const, apiKey }
  })
}
