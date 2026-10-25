import {
  queryPageMessage,
  queryPageParameter,
  queryPageSize,
} from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import ApiKey from '#models/api_key'

export const activeApiKeysQuery: AiQueryTemplate = {
  code: 'active_api_keys',
  permission: 'api-keys:read',
  version: 2,
  description:
    'List active, unrevoked API Key metadata without secret values; this is not a lookup for one named key and omits revoked keys. If the user wants to delete a key but has not identified it, use revoked_api_keys. For a specific key by name or ID, use api_key_profile. Results can be paginated with params.page.',
  parameters: { page: queryPageParameter },
  async execute(params) {
    const keys = await ApiKey.query()
      .whereNull('revoked_at')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .paginate(params.page as number, queryPageSize)
    return {
      rows: keys.all().map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        expiresAt: key.expiresAt?.toISO() ?? null,
        lastUsedAt: key.lastUsedAt?.toISO() ?? null,
      })),
      message: queryPageMessage(keys.getMeta()),
    }
  },
}
