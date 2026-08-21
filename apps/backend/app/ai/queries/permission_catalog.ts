import { queryResultLimit } from '#ai/registry/ai_agent_query_helpers'
import type { AiQueryTemplate } from '#ai/registry/ai_agent_query_types'
import Permission from '#models/permission'

export const permissionCatalogQuery: AiQueryTemplate = {
  code: 'permission_catalog',
  version: 1,
  description: 'List permission catalog entries with role reference counts.',
  permission: 'permissions:read',
  parameters: {},
  async execute() {
    const permissions = await Permission.query()
      .withCount('roles')
      .orderBy('group_name')
      .orderBy('code')
      .limit(queryResultLimit)
    return {
      rows: permissions.map((permission) => ({
        id: permission.id,
        code: permission.code,
        name: permission.name,
        groupName: permission.groupName,
        description: permission.description,
        isSystem: permission.isSystem,
        roleCount: Number(permission.$extras.roles_count ?? 0),
      })),
    }
  },
}
