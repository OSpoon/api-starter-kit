import { fetchAllQueryPages } from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import Role from '#models/role'
import { permissionCatalogCodes } from '#services/permission_catalog'

export const rolesWithPermissionsQuery: AiQueryTemplate = {
  code: 'roles_with_permissions',
  version: 3,
  description: 'List all roles with every assigned permission and user counts.',
  permission: 'roles:read',
  parameters: {},
  async execute() {
    const roles = await fetchAllQueryPages((page, pageSize) =>
      Role.query()
        .preload('permissions', (query) =>
          query.whereIn('code', permissionCatalogCodes).orderBy('code')
        )
        .withCount('users')
        .orderBy('is_system', 'desc')
        .orderBy('name')
        .orderBy('code')
        .paginate(page, pageSize)
    )
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
