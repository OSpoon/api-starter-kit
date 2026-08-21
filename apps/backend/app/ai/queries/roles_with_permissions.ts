import { queryResultLimit } from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import Role from '#models/role'

export const rolesWithPermissionsQuery: AiQueryTemplate = {
  code: 'roles_with_permissions',
  version: 1,
  description: 'List roles with assigned permissions and user counts.',
  permission: 'roles:read',
  parameters: {},
  async execute() {
    const roles = await Role.query()
      .preload('permissions', (query) => query.orderBy('code').limit(200))
      .withCount('users')
      .orderBy('is_system', 'desc')
      .orderBy('name')
      .limit(queryResultLimit)
    return {
      rows: roles.map((role) => ({
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
        })),
      })),
    }
  },
}
