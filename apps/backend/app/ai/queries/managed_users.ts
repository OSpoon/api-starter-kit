import { maskEmail, maskName, queryResultLimit } from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import User from '#models/user'
import { CHANNEL_GUEST_USER_EMAIL } from '#services/channel_guest_principal'

export const managedUsersQuery: AiQueryTemplate = {
  code: 'managed_users',
  version: 1,
  description: 'List managed users with masked personal information and their roles.',
  permission: 'users:read',
  parameters: {},
  async execute() {
    const users = await User.query()
      .whereNot('email', CHANNEL_GUEST_USER_EMAIL)
      .preload('roles')
      .orderBy('id')
      .limit(queryResultLimit)
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
