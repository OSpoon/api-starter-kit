import type { HttpContext } from '@adonisjs/core/http'
import { ApiResponse } from '@foadonis/openapi/decorators'

import Permission from '#models/permission'
import { permissionCatalogCodes } from '#services/permission_catalog'
import { clampLimit } from '#support/pagination'
import { listAccessControlValidator } from '#validators/rbac'

function serializePermission(permission: Permission) {
  return {
    id: permission.id,
    code: permission.code,
    name: permission.name,
    groupName: permission.groupName,
    description: permission.description,
    isSystem: permission.isSystem,
    roleCount: Number(permission.$extras.roles_count ?? 0),
    roles: permission.roles?.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
    })),
  }
}

export default class PermissionsController {
  async catalog({ serialize }: HttpContext) {
    const permissions = await Permission.query()
      .whereIn('code', permissionCatalogCodes)
      .orderBy('group_name')
      .orderBy('code')
    return serialize(
      permissions.map((permission) => ({
        id: permission.id,
        code: permission.code,
        name: permission.name,
        groupName: permission.groupName,
      }))
    )
  }

  @ApiResponse({ status: 422, description: '查询参数无效' })
  async index({ request, serialize }: HttpContext) {
    const filters = await request.validateUsing(listAccessControlValidator, { data: request.qs() })
    const page = Number(filters.page ?? 1)
    const search = filters.search ?? ''
    const groupName = filters.groupName ?? ''
    const query = Permission.query()
      .whereIn('code', permissionCatalogCodes)
      .withCount('roles')
      .preload('roles', (roles) => roles.select(['id', 'code', 'name']))
      .orderBy('group_name')
      .orderBy('code')
    if (search) {
      query.where((builder) => {
        builder
          .whereILike('code', `%${search}%`)
          .orWhereILike('name', `%${search}%`)
          .orWhereILike('group_name', `%${search}%`)
          .orWhereILike('description', `%${search}%`)
      })
    }
    if (groupName) query.where('group_name', groupName)
    const paginator = await query.paginate(page, clampLimit(filters.limit, 20, 100))
    return serialize({ items: paginator.all().map(serializePermission), meta: paginator.getMeta() })
  }
}
