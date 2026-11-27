import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import Permission from '#models/permission'
import { permissionCatalogCodes } from '#services/permission_catalog'
import { clampLimit } from '#support/pagination'
import { listPermissionsValidator } from '#validators/rbac'

import {
  type ApiSchema,
  dataEnvelope,
  errorResponseSchema,
  paginationMetaSchema,
} from '../openapi/response_schemas.js'

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

const permissionSchema: ApiSchema = {
  type: 'object',
  required: ['id', 'code', 'name', 'groupName', 'description', 'isSystem', 'roleCount'],
  properties: {
    id: { type: 'integer' },
    code: { type: 'string' },
    name: { type: 'string' },
    groupName: { type: 'string' },
    description: { type: 'string' },
    isSystem: { type: 'boolean' },
    roleCount: { type: 'integer' },
    roles: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'code', 'name'],
        properties: { id: { type: 'integer' }, code: { type: 'string' }, name: { type: 'string' } },
      },
    },
  },
}

@ApiSecurity('bearerAuth')
export default class PermissionsController {
  @ApiOperation({ summary: '获取权限目录', description: '返回系统权限的 ID、编码、名称和分组。' })
  @ApiResponse({
    status: 200,
    description: '权限目录',
    schema: dataEnvelope({
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'code', 'name', 'groupName'],
        properties: {
          id: { type: 'integer' },
          code: { type: 'string' },
          name: { type: 'string' },
          groupName: { type: 'string' },
        },
      },
    }),
  })
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

  @ApiOperation({
    summary: '分页获取权限',
    description: '按编码、名称、说明或权限分组筛选系统权限。',
  })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiQuery({ name: 'code', required: false, schema: { type: 'string', maxLength: 100 } })
  @ApiQuery({ name: 'name', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({ name: 'description', required: false, schema: { type: 'string', maxLength: 1000 } })
  @ApiQuery({ name: 'groupName', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({
    name: 'groupNames',
    required: false,
    schema: {
      type: 'string',
      pattern: '^[^,]{1,120}(,[^,]{1,120})*$',
      description: '以逗号分隔的权限分组名称',
    },
  })
  @ApiResponse({
    status: 200,
    description: '权限分页列表及分页元数据',
    schema: dataEnvelope({
      type: 'object',
      required: ['items', 'meta'],
      properties: {
        items: { type: 'array', items: permissionSchema },
        meta: paginationMetaSchema,
      },
    }),
  })
  @ApiResponse({ status: 422, description: '查询参数无效', schema: errorResponseSchema })
  async index({ request, serialize }: HttpContext) {
    const filters = await request.validateUsing(listPermissionsValidator, { data: request.qs() })
    const page = Number(filters.page ?? 1)
    const groupNames = filters.groupNames?.split(',').map((groupName) => groupName.trim())
    const query = Permission.query()
      .whereIn('code', permissionCatalogCodes)
      .withCount('roles')
      .preload('roles', (roles) => roles.select(['id', 'code', 'name']))
      .orderBy('group_name')
      .orderBy('code')
    if (filters.code) query.whereILike('code', `%${filters.code}%`)
    if (filters.name) query.whereILike('name', `%${filters.name}%`)
    if (filters.description) query.whereILike('description', `%${filters.description}%`)
    if (groupNames?.length) query.whereIn('group_name', groupNames)
    else if (filters.groupName) query.where('group_name', filters.groupName)
    const paginator = await query.paginate(page, clampLimit(filters.limit, 20, 100))
    return serialize({ items: paginator.all().map(serializePermission), meta: paginator.getMeta() })
  }
}
