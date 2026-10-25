import {
  maskEmail,
  maskName,
  queryPageMessage,
  queryPageParameter,
  queryPageSize,
} from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import User from '#models/user'
import {
  AI_INTEGRATION_USER_EMAIL,
  CHANNEL_GUEST_USER_EMAIL,
} from '#services/channel_guest_principal'

export const managedUsersQuery: AiQueryTemplate = {
  code: 'managed_users',
  permission: 'users:read',
  version: 2,
  description:
    'List managed users with masked personal information and their roles; results can be paginated with params.page.',
  parameters: { page: queryPageParameter },
  async execute(params) {
    const users = await User.query()
      .whereNotIn('email', [CHANNEL_GUEST_USER_EMAIL, AI_INTEGRATION_USER_EMAIL])
      .preload('roles')
      .orderBy('id')
      .paginate(params.page as number, queryPageSize)
    return {
      rows: users.all().map((user) => ({
        id: user.id,
        fullName: maskName(user.fullName ?? ''),
        email: maskEmail(user.email),
        twoFactorEnabled: user.twoFactorEnabled,
        roles: user.roles.map((role) => ({ id: role.id, code: role.code, name: role.name })),
      })),
      message: queryPageMessage(users.getMeta()),
    }
  },
}
