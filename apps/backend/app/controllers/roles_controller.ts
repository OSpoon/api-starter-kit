import type { HttpContext } from '@adonisjs/core/http'
import { ApiResponse } from '@foadonis/openapi/decorators'

import Role from '#models/role'
import {
  AccessControlMutationError,
  createRoleWithPermissions,
  updateRoleWithPermissions,
} from '#services/access_control_mutations'
import { recordAuditEvent } from '#services/audit_log'
import { clampLimit } from '#support/pagination'
import { createRoleValidator, updateRoleValidator } from '#validators/rbac'

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

export default class RolesController {
  async catalog({ serialize }: HttpContext) {
    const roles = await Role.query().orderBy('is_system', 'desc').orderBy('name')
    return serialize(roles.map((role) => ({ id: role.id, code: role.code, name: role.name })))
  }

  async index({ request, serialize }: HttpContext) {
    const page = Math.max(Number(request.input('page', 1)) || 1, 1)
    const search = String(request.input('search', '')).trim()
    const query = Role.query()
      .preload('permissions')
      .withCount('users')
      .orderBy('is_system', 'desc')
      .orderBy('name')
    if (search) {
      query.where((builder) => {
        builder
          .whereILike('code', `%${search}%`)
          .orWhereILike('name', `%${search}%`)
          .orWhereILike('description', `%${search}%`)
      })
    }
    const paginator = await query.paginate(page, clampLimit(request.input('limit'), 20, 100))
    return serialize({ items: paginator.all().map(serializeRole), meta: paginator.getMeta() })
  }

  @ApiResponse({ status: 409, description: '角色代码已存在或引用了不存在的权限' })
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
        description: payload.description ?? null,
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
      throw error
    }
    await role.load('permissions')
    return serialize(serializeRole(role))
  }

  @ApiResponse({ status: 409, description: '角色引用了不存在的权限' })
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
        description: payload.description ?? null,
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
      throw error
    }
    await updatedRole.load('permissions')
    return serialize(serializeRole(updatedRole))
  }

  async destroy(ctx: HttpContext) {
    const { auth, params, response, serialize } = ctx
    const role = await Role.query()
      .where('id', params.id)
      .withCount('users')
      .withCount('permissions')
      .firstOrFail()
    if (role.isSystem) {
      return response.forbidden({ message: '系统内置角色不可删除' })
    }
    if (Number(role.$extras.users_count ?? 0) > 0) {
      return response.conflict({ message: '角色仍分配给用户，无法删除' })
    }
    if (Number(role.$extras.permissions_count ?? 0) > 0) {
      return response.conflict({ message: '角色仍有已分配的权限，无法删除' })
    }
    await role.delete()
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'role.deleted',
      targetType: 'role',
      targetId: role.id,
    })
    return serialize({ id: role.id, deleted: true })
  }
}
