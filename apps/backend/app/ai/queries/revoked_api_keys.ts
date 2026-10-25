import {
  queryPageMessage,
  queryPageParameter,
  queryPageSize,
} from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import ApiKey from '#models/api_key'

export const revokedApiKeysQuery: AiQueryTemplate = {
  code: 'revoked_api_keys',
  permission: 'api-keys:read',
  version: 1,
  description:
    'List API Keys that have already been revoked and are eligible for deletion, without secret values. Use this when the user wants to delete a key but has not identified which one. Results can be paginated with params.page.',
  parameters: { page: queryPageParameter },
  async execute(params) {
    const keys = await ApiKey.query()
      .whereNotNull('revoked_at')
      .orderBy('revoked_at', 'desc')
      .orderBy('id', 'desc')
      .paginate(params.page as number, queryPageSize)
    return {
      rows: keys.all().map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        revokedAt: key.revokedAt?.toISO() ?? null,
        expiresAt: key.expiresAt?.toISO() ?? null,
      })),
      message: queryPageMessage(keys.getMeta()),
    }
  },
}
