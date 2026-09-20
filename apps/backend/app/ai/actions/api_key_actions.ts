import type { AiAgentActionImplementation } from '#ai/core/ai_agent_action_contracts'
import {
  defineAiAgentAction,
  ensurePermission,
  integer,
  string,
  summaryValue,
} from '#ai/core/ai_agent_action_helpers'
import ApiKey from '#models/api_key'
import { createApiKey, deleteRevokedApiKey, revokeApiKey } from '#services/api_key_service'

async function resolveApiKeyId(input: Record<string, unknown>) {
  const value = [input.apiKeyId, input.id].find((candidate) => candidate !== undefined)
  if (value !== undefined) return integer({ apiKeyId: value }, 'apiKeyId')
  if (input.name === undefined) {
    throw new Error('请提供 API Key 的精确名称或正整数 ID')
  }
  const name = string(input, 'name', 120)
  const matches = await ApiKey.query().where('name', name).limit(2)
  if (matches.length === 0) throw new Error('API Key 不存在')
  if (matches.length > 1) throw new Error('存在多个同名 API Key，请提供 apiKeyId')
  return matches[0].id
}

const revokeApiKeyAction: AiAgentActionImplementation = {
  permission: 'api-keys:delete',
  async prepare(input) {
    // Small models commonly use the visible table's generic `id` field. The
    // canonical payload remains apiKeyId after validation and target lookup.
    const apiKey = await ApiKey.find(await resolveApiKeyId(input))
    if (!apiKey) throw new Error('API Key 不存在')
    if (apiKey.revokedAt) throw new Error('该 API Key 已被吊销，如需删除请改用 delete_api_key 操作')
    return {
      targetType: 'api_key',
      targetId: String(apiKey.id),
      targetSummary: { name: apiKey.name, prefix: apiKey.prefix },
      payload: { apiKeyId: apiKey.id },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'api-keys:delete')
    await revokeApiKey(ctx, {
      actorUserId: actor.id,
      apiKeyId: integer(confirmation.payload, 'apiKeyId'),
      source: 'ai_agent',
    })
  },
}

const deleteApiKeyAction: AiAgentActionImplementation = {
  permission: 'api-keys:delete',
  async prepare(input) {
    const apiKey = await ApiKey.find(await resolveApiKeyId(input))
    if (!apiKey) throw new Error('API Key 不存在')
    if (!apiKey.revokedAt)
      throw new Error('仅已吊销的 API Key 可被删除，请改用 revoke_api_key 操作')
    return {
      targetType: 'api_key',
      targetId: String(apiKey.id),
      targetSummary: { name: apiKey.name, prefix: apiKey.prefix },
      payload: { apiKeyId: apiKey.id },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'api-keys:delete')
    await deleteRevokedApiKey(ctx, {
      actorUserId: actor.id,
      apiKeyId: integer(confirmation.payload, 'apiKeyId'),
      source: 'ai_agent',
    })
  },
}

const createApiKeyAction: AiAgentActionImplementation = {
  permission: 'api-keys:create',
  async prepare(input) {
    const name = string(input, 'name', 120)
    const expiresIn = input.expiresIn
    if (expiresIn !== undefined && !['30d', '90d', '180d', 'long'].includes(String(expiresIn)))
      throw new Error('expiresIn 无效')
    return {
      targetType: 'api_key',
      targetId: name,
      targetSummary: { name },
      payload: { name, expiresIn },
    }
  },
  async execute({ confirmation, ctx }) {
    const actor = await ensurePermission(ctx, 'api-keys:create')
    const { apiKey, secret } = await createApiKey(
      ctx,
      actor.id,
      {
        name: string(confirmation.payload, 'name', 120),
        expiresIn: confirmation.payload.expiresIn as '30d' | '90d' | '180d' | 'long' | undefined,
      },
      'ai_agent'
    )
    return {
      credential: { kind: 'api_key', value: secret, label: apiKey.name },
      apiKeyId: apiKey.id,
    }
  },
}

export const apiKeyActions = {
  revoke_api_key: defineAiAgentAction(revokeApiKeyAction, {
    impact: 'destructive',
    summarize: () => [{ field: 'result', value: 'revoked' }],
  }),
  delete_api_key: defineAiAgentAction(deleteApiKeyAction, {
    impact: 'destructive',
    summarize: () => [{ field: 'result', value: 'permanently_deleted' }],
  }),
  create_api_key: defineAiAgentAction(createApiKeyAction, {
    impact: 'standard',
    summarize: (payload: Record<string, unknown>) => [
      { field: 'name', value: summaryValue(payload, 'name') },
      { field: 'expiry', value: summaryValue(payload, 'expiresIn') },
    ],
  }),
}
