import { fetchAllQueryPages, maskEmail, maskName } from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import User from '#models/user'
import {
  AI_INTEGRATION_USER_EMAIL,
  CHANNEL_GUEST_USER_EMAIL,
} from '#services/channel_guest_principal'

export const managedUsersQuery: AiQueryTemplate = {
  code: 'managed_users',
  version: 3,
  description: 'List all managed users with masked personal information and their roles.',
  permission: 'users:read',
  parameters: {},
  async execute() {
    const users = await fetchAllQueryPages((page, pageSize) =>
      User.query()
        .whereNotIn('email', [CHANNEL_GUEST_USER_EMAIL, AI_INTEGRATION_USER_EMAIL])
        .preload('roles')
        .orderBy('id')
        .paginate(page, pageSize)
    )
    return {
      rows: users.map((user) => ({
        id: user.id,
        fullName: maskName(user.fullName ?? ''),
        email: maskEmail(user.email),
        twoFactorEnabled: user.twoFactorEnabled,
        roles: user.roles.map((role) => ({ id: role.id, code: role.code, name: role.name })),
      })),
    }
  },
}
