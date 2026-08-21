import { z } from 'zod'

import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import Permission from '#models/permission'

export const permissionUsageQuery: AiQueryTemplate = {
  code: 'permission_usage',
  version: 1,
  description: 'Look up one permission by its stable code and the roles that currently use it.',
  permission: 'permissions:read',
  parameters: {
    permissionCode: {
      description: 'Required stable permission code, for example users:read.',
      required: true,
      schema: z.string().trim().min(3).max(120),
    },
  },
  async execute(params) {
    const permission = await Permission.query()
      .where('code', params.permissionCode as string)
      .preload('roles', (query) => query.orderBy('code'))
      .first()
    if (!permission) return { rows: [], message: 'No permission matched that code.' }
    return {
      rows: [
        {
          id: permission.id,
          code: permission.code,
          name: permission.name,
          groupName: permission.groupName,
          description: permission.description,
          isSystem: permission.isSystem,
          roles: permission.roles.map((role) => ({
            id: role.id,
            code: role.code,
            name: role.name,
            isSystem: role.isSystem,
          })),
        },
      ],
    }
  },
}
