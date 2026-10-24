import {
  queryPageMessage,
  queryPageParameter,
  queryPageSize,
} from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import ApiKey from '#models/api_key'

export const activeApiKeysQuery: AiQueryTemplate = {
  code: 'active_api_keys',
  version: 2,
  description:
    'List active API Key metadata without secret values; results can be paginated with params.page.',
  permission: 'api-keys:read',
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
