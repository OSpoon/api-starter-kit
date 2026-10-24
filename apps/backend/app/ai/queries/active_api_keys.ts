import { fetchAllQueryPages } from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import ApiKey from '#models/api_key'

export const activeApiKeysQuery: AiQueryTemplate = {
  code: 'active_api_keys',
  version: 3,
  description: 'List all active API Key metadata without secret values.',
  permission: 'api-keys:read',
  parameters: {},
  async execute() {
    const keys = await fetchAllQueryPages((page, pageSize) =>
      ApiKey.query()
        .whereNull('revoked_at')
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .paginate(page, pageSize)
    )
    return {
      rows: keys.map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        expiresAt: key.expiresAt?.toISO() ?? null,
        lastUsedAt: key.lastUsedAt?.toISO() ?? null,
      })),
    }
  },
}
