import { z } from 'zod'

import { maskEmail, maskName } from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import User from '#models/user'
import { CHANNEL_GUEST_USER_EMAIL } from '#services/channel_guest_principal'

export const managedUserProfileQuery: AiQueryTemplate = {
  code: 'managed_user_profile',
  version: 1,
  description: 'Look up one managed user by ID. Ask for userId when it was not supplied.',
  permission: 'users:read',
  parameters: {
    userId: {
      description: 'Required positive managed-user ID.',
      required: true,
      schema: z.coerce.number().int().positive(),
    },
  },
  async execute(params) {
    const user = await User.query()
      .where('id', params.userId as number)
      .whereNot('email', CHANNEL_GUEST_USER_EMAIL)
      .preload('roles')
      .first()
    if (!user) return { rows: [], message: 'No managed user matched that ID.' }
    return {
      rows: [
        {
          id: user.id,
          fullName: maskName(user.fullName ?? ''),
          email: maskEmail(user.email),
          twoFactorEnabled: user.twoFactorEnabled,
          disabled: Boolean(user.disabledAt),
          roles: user.roles.map((role) => ({ id: role.id, code: role.code, name: role.name })),
        },
      ],
    }
  },
}
