import { z } from 'zod'

import { maskEmail, maskName } from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import User from '#models/user'
import {
  AI_INTEGRATION_USER_EMAIL,
  CHANNEL_GUEST_USER_EMAIL,
} from '#services/channel_guest_principal'

export const managedUserProfileQuery: AiQueryTemplate = {
  code: 'managed_user_profile',
  version: 3,
  permission: 'users:read',
  description:
    'Look up managed users by ID, exact email, or exact full name. Use the exact identifier supplied by the user; exact names can match more than one user, so ask the user to choose by ID when ambiguous.',
  parameters: {
    userId: {
      description: 'Positive managed-user ID; provide exactly one lookup field.',
      schema: z.coerce.number().int().positive().optional(),
    },
    email: {
      description: 'Exact email address supplied by the user; provide exactly one lookup field.',
      schema: z.string().trim().email().max(254).optional(),
    },
    fullName: {
      description: 'Exact full name supplied by the user; provide exactly one lookup field.',
      schema: z.string().trim().min(1).max(120).optional(),
    },
  },
  async execute(params) {
    const hasUserId = params.userId !== undefined && params.userId !== null
    const hasEmail = typeof params.email === 'string' && params.email.trim() !== ''
    const hasFullName = typeof params.fullName === 'string' && params.fullName.trim() !== ''
    if (Number(hasUserId) + Number(hasEmail) + Number(hasFullName) !== 1) {
      throw new Error('请提供用户 ID、精确邮箱或精确姓名中的一项')
    }
    const query = User.query().whereNotIn('email', [
      CHANNEL_GUEST_USER_EMAIL,
      AI_INTEGRATION_USER_EMAIL,
    ])
    if (hasUserId) query.where('id', params.userId as number)
    else if (hasEmail) query.where('email', params.email as string)
    else query.where('full_name', params.fullName as string).limit(2)
    const users = await query.preload('roles')
    const matchField = hasUserId ? 'userId' : hasEmail ? 'email' : 'fullName'
    if (!users.length) {
      return {
        rows: [],
        match: { status: 'not_found', field: matchField },
        message: 'No managed user matched that exact target.',
      }
    }
    return {
      match: {
        status: hasFullName && users.length > 1 ? 'ambiguous' : 'matched',
        field: matchField,
      },
      rows: users.map((user) => ({
        id: user.id,
        fullName: maskName(user.fullName ?? ''),
        email: maskEmail(user.email),
        twoFactorEnabled: user.twoFactorEnabled,
        disabled: Boolean(user.disabledAt),
        roles: user.roles.map((role) => ({ id: role.id, code: role.code, name: role.name })),
      })),
      ...(hasFullName && users.length > 1
        ? { message: 'Multiple users matched this exact full name; ask the user to choose by ID.' }
        : {}),
    }
  },
}
