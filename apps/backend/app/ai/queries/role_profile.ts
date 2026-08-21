import { z } from 'zod'

import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import Role from '#models/role'

export const roleProfileQuery: AiQueryTemplate = {
  code: 'role_profile',
  version: 1,
  description: 'Look up one role by its stable code with assigned permissions and user count.',
  permission: 'roles:read',
  parameters: {
    roleCode: {
      description: 'Required stable role code, for example editor.',
      required: true,
      schema: z.string().trim().min(1).max(120),
    },
  },
  async execute(params) {
    const role = await Role.query()
      .where('code', params.roleCode as string)
      .preload('permissions', (query) => query.orderBy('code'))
      .withCount('users')
      .first()
    if (!role) return { rows: [], message: 'No role matched that code.' }
    return {
      rows: [
        {
          id: role.id,
          code: role.code,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          userCount: Number(role.$extras.users_count ?? 0),
          permissions: role.permissions.map((permission) => ({
            id: permission.id,
            code: permission.code,
            name: permission.name,
            groupName: permission.groupName,
          })),
        },
      ],
    }
  },
}
