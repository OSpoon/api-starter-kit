import { z } from 'zod'

import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import ApiKey from '#models/api_key'

export const apiKeyProfileQuery: AiQueryTemplate = {
  code: 'api_key_profile',
  version: 1,
  description:
    'Look up one API Key by positive ID (apiKeyId or id) or exact name and report its name, prefix, and revoked status. Use the exact name supplied by the user when no ID is available; never invent an ID.',
  permission: 'api-keys:read',
  parameters: {
    apiKeyId: {
      description: 'Positive API Key ID; provide this or name.',
      schema: z.coerce.number().int().positive().optional(),
    },
    id: {
      description: 'Positive API Key ID alias; provide this or name.',
      schema: z.coerce.number().int().positive().optional(),
    },
    name: {
      description: 'Exact API Key name; provide this or an ID.',
      schema: z.string().trim().min(1).max(120).optional(),
    },
  },
  async execute(params) {
    const hasApiKeyId = params.apiKeyId !== undefined && params.apiKeyId !== null
    const hasId = params.id !== undefined && params.id !== null
    const hasName = typeof params.name === 'string' && params.name.trim() !== ''
    if (Number(hasApiKeyId) + Number(hasId) + Number(hasName) !== 1) {
      throw new Error('请提供 API Key 的正整数 ID 或精确名称（二选一）')
    }
    const query = ApiKey.query()
    if (hasApiKeyId || hasId) query.where('id', (params.apiKeyId ?? params.id) as number)
    else query.where('name', params.name as string).limit(2)
    const matches = await query
    if (matches.length > 1) throw new Error('存在多个同名 API Key，请提供 apiKeyId')
    const key = matches[0]
    if (!key) return { rows: [], message: 'No API Key matched that ID or name.' }
    return {
      rows: [
        {
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          status: key.revokedAt ? 'revoked' : 'active',
          expiresAt: key.expiresAt?.toISO() ?? null,
        },
      ],
    }
  },
}
