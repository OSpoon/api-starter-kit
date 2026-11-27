import type { HttpContext } from '@adonisjs/core/http'
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@foadonis/openapi/decorators'

import Role from '#models/role'
import {
  AccessControlMutationError,
  createRoleWithPermissions,
  deleteRoleWithAudit,
  updateRoleWithPermissions,
} from '#services/access_control_mutations'
import { permissionCatalogCodes } from '#services/permission_catalog'
import { clampLimit } from '#support/pagination'
import { createRoleValidator, listRolesValidator, updateRoleValidator } from '#validators/rbac'

import {
  type ApiSchema,
  dataEnvelope,
  errorResponseSchema,
  paginationMetaSchema,
} from '../openapi/response_schemas.js'

function serializeRole(role: Role) {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissionIds: role.permissions?.map((permission) => permission.id) ?? [],
    userCount: Number(role.$extras.users_count ?? 0),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  }
}

const roleSchema: ApiSchema = {
  type: 'object',
  required: ['id', 'code', 'name', 'description', 'isSystem', 'permissionIds', 'userCount'],
  properties: {
    id: { type: 'integer' },
    code: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    isSystem: { type: 'boolean' },
    permissionIds: { type: 'array', items: { type: 'integer' } },
    userCount: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
}

@ApiSecurity('bearerAuth')
export default class RolesController {
  @ApiOperation({
    summary: '获取角色目录',
    description: '返回角色 ID、编码和名称，供管理界面选择。',
  })
  @ApiResponse({
    status: 200,
    description: '角色目录',
    schema: dataEnvelope({
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'code', 'name'],
        properties: { id: { type: 'integer' }, code: { type: 'string' }, name: { type: 'string' } },
      },
    }),
  })
  async catalog({ serialize }: HttpContext) {
    const roles = await Role.query().orderBy('is_system', 'desc').orderBy('name')
    return serialize(roles.map((role) => ({ id: role.id, code: role.code, name: role.name })))
  }

  @ApiOperation({ summary: '分页获取角色', description: '按角色编码、名称或说明筛选角色。' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiQuery({ name: 'code', required: false, schema: { type: 'string', maxLength: 100 } })
  @ApiQuery({ name: 'name', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({ name: 'description', required: false, schema: { type: 'string', maxLength: 1000 } })
  @ApiResponse({
    status: 200,
    description: '角色分页列表及分页元数据',
    schema: dataEnvelope({
      type: 'object',
      required: ['items', 'meta'],
      properties: {
        items: { type: 'array', items: roleSchema },
        meta: paginationMetaSchema,
      },
    }),
  })
  @ApiResponse({ status: 422, description: '查询参数无效', schema: errorResponseSchema })
  async index({ request, serialize }: HttpContext) {
    const filters = await request.validateUsing(listRolesValidator, { data: request.qs() })
    const page = Number(filters.page ?? 1)
    const query = Role.query()
      .preload('permissions', (permissions) => permissions.whereIn('code', permissionCatalogCodes))
      .withCount('users')
      .orderBy('is_system', 'desc')
      .orderBy('name')
    if (filters.code) query.whereILike('code', `%${filters.code}%`)
    if (filters.name) query.whereILike('name', `%${filters.name}%`)
    if (filters.description) query.whereILike('description', `%${filters.description}%`)
    const paginator = await query.paginate(page, clampLimit(filters.limit, 20, 100))
    return serialize({ items: paginator.all().map(serializeRole), meta: paginator.getMeta() })
  }

  @ApiBody({
    mediaType: 'application/json',
    required: true,
    schema: {
      type: 'object',
      required: ['code', 'name', 'description'],
      properties: {
        code: { type: 'string', minLength: 2, maxLength: 100, pattern: '^[a-z0-9-]+$' },
        name: { type: 'string', minLength: 1, maxLength: 120 },
        description: { type: 'string', minLength: 1, maxLength: 1000 },
        permissionIds: { type: 'array', items: { type: 'integer', minimum: 1 } },
      },
    },
  })
  @ApiOperation({ summary: '创建角色', description: '创建角色时必须提供非空角色说明。' })
  @ApiResponse({ status: 200, description: '已创建的角色', schema: dataEnvelope(roleSchema) })
  @ApiResponse({ status: 403, description: '操作者无权授予指定权限', schema: errorResponseSchema })
  @ApiResponse({
    status: 409,
    description: '角色代码已存在或引用了不存在的权限',
    schema: errorResponseSchema,
  })
  @ApiResponse({ status: 422, description: '角色参数无效', schema: errorResponseSchema })
  async store(ctx: HttpContext) {
    const { auth, request, response, serialize } = ctx
    const payload = await request.validateUsing(createRoleValidator)
    let role: Role
    try {
      role = await createRoleWithPermissions({
        ctx,
        actorUserId: auth.getUserOrFail().id,
        code: payload.code,
        name: payload.name,
        description: payload.description,
        permissionIds: payload.permissionIds ?? [],
        source: 'api',
      })
    } catch (error) {
      if (error instanceof AccessControlMutationError && error.code === 'invalid_permission_ids') {
        return response.conflict({ message: error.message })
      }
      if (error instanceof AccessControlMutationError && error.code === 'duplicate_role_code') {
        return response.conflict({ message: error.message })
      }
      if (
        error instanceof AccessControlMutationError &&
        (error.code === 'grant_exceeds_actor_permissions' || error.code === 'inactive_actor')
      ) {
        return response.forbidden({ message: error.message })
      }
      throw error
    }
    await role.load('permissions')
    return serialize(serializeRole(role))
  }

  @ApiBody({
    mediaType: 'application/json',
    required: true,
    schema: {
      type: 'object',
      required: ['name', 'description'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 120 },
        description: { type: 'string', minLength: 1, maxLength: 1000 },
        permissionIds: { type: 'array', items: { type: 'integer', minimum: 1 } },
      },
    },
  })
  @ApiOperation({ summary: '更新角色', description: '更新角色时必须提供非空角色说明。' })
  @ApiResponse({ status: 200, description: '已更新的角色', schema: dataEnvelope(roleSchema) })
  @ApiResponse({
    status: 403,
    description: '系统角色不可编辑或操作者权限不足',
    schema: errorResponseSchema,
  })
  @ApiResponse({ status: 409, description: '角色引用了不存在的权限', schema: errorResponseSchema })
  @ApiResponse({ status: 422, description: '角色参数无效', schema: errorResponseSchema })
  async update(ctx: HttpContext) {
    const { auth, params, request, response, serialize } = ctx
    const role = await Role.findOrFail(params.id)
    if (role.isSystem) {
      return response.forbidden({ message: '系统内置角色不可编辑' })
    }
    const payload = await request.validateUsing(updateRoleValidator)
    let updatedRole: Role
    try {
      updatedRole = await updateRoleWithPermissions({
        ctx,
        actorUserId: auth.getUserOrFail().id,
        roleId: role.id,
        name: payload.name,
        description: payload.description,
        permissionIds: payload.permissionIds,
        source: 'api',
      })
    } catch (error) {
      if (error instanceof AccessControlMutationError && error.code === 'invalid_permission_ids') {
        return response.conflict({ message: error.message })
      }
      if (error instanceof AccessControlMutationError && error.code === 'protected_role') {
        return response.forbidden({ message: error.message })
      }
      if (
        error instanceof AccessControlMutationError &&
        (error.code === 'grant_exceeds_actor_permissions' || error.code === 'inactive_actor')
      ) {
        return response.forbidden({ message: error.message })
      }
      throw error
    }
    await updatedRole.load('permissions')
    return serialize(serializeRole(updatedRole))
  }

  @ApiOperation({ summary: '删除角色', description: '删除未被用户使用的角色。系统角色不可删除。' })
  @ApiResponse({
    status: 200,
    description: '角色删除结果',
    schema: dataEnvelope({
      type: 'object',
      required: ['id', 'deleted'],
      properties: { id: { type: 'integer' }, deleted: { type: 'boolean', enum: [true] } },
    }),
  })
  @ApiResponse({
    status: 403,
    description: '系统角色不可删除或操作者权限不足',
    schema: errorResponseSchema,
  })
  @ApiResponse({ status: 404, description: '角色不存在', schema: errorResponseSchema })
  @ApiResponse({ status: 409, description: '角色仍被用户引用', schema: errorResponseSchema })
  async destroy(ctx: HttpContext) {
    const { auth, params, response, serialize } = ctx
    try {
      const id = await deleteRoleWithAudit({
        ctx,
        actorUserId: auth.getUserOrFail().id,
        roleId: params.id,
        source: 'api',
      })
      return serialize({ id, deleted: true })
    } catch (error) {
      if (!(error instanceof AccessControlMutationError)) throw error
      if (error.code === 'protected_role') return response.forbidden({ message: error.message })
      if (error.code === 'role_in_use') return response.conflict({ message: error.message })
      if (error.code === 'role_not_found') return response.notFound({ message: error.message })
      throw error
    }
  }
}
