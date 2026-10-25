import {
  queryPageMessage,
  queryPageParameter,
  queryPageSize,
} from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import Role from '#models/role'
import { permissionCatalogCodes } from '#services/permission_catalog'

export const rolesWithPermissionsQuery: AiQueryTemplate = {
  code: 'roles_with_permissions',
  permission: 'roles:read',
  version: 2,
  description:
    'List roles with every assigned permission and user counts; roles can be paginated with params.page.',
  parameters: { page: queryPageParameter },
  async execute(params) {
    const roles = await Role.query()
      .preload('permissions', (query) =>
        query.whereIn('code', permissionCatalogCodes).orderBy('code')
      )
      .withCount('users')
      .orderBy('is_system', 'desc')
      .orderBy('name')
      .orderBy('code')
      .paginate(params.page as number, queryPageSize)
    return {
      rows: roles.all().map((role) => ({
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
      message: queryPageMessage(roles.getMeta()),
    }
  },
}
