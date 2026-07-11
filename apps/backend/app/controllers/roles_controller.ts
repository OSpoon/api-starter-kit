import type { HttpContext } from '@adonisjs/core/http'

import Permission from '#models/permission'
import Role from '#models/role'
import { recordAuditEvent } from '#services/audit_log'
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

async function ensurePermissionIds(permissionIds: number[]) {
  const permissions = await Permission.query().whereIn('id', permissionIds)
  return permissions.length === permissionIds.length
}

export default class RolesController {
  async index({ serialize }: HttpContext) {
    const roles = await Role.query()
      .preload('permissions')
      .withCount('users')
      .orderBy('is_system', 'desc')
      .orderBy('name')
    return serialize(roles.map(serializeRole))
  }

  async store(ctx: HttpContext) {
    const { auth, request, response, serialize } = ctx
    const payload = await request.validateUsing(createRoleValidator)
    const role = await Role.create({
      code: payload.code,
      name: payload.name,
      description: payload.description ?? null,
    })
    if (payload.permissionIds && !(await ensurePermissionIds(payload.permissionIds))) {
      await role.delete()
      return response.badRequest({ message: '包含不存在的权限' })
    }
    if (payload.permissionIds) {
      await role.related('permissions').sync(payload.permissionIds)
    }
    await role.load('permissions')
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'role.created',
      targetType: 'role',
      targetId: role.id,
      metadata: { permissionIds: payload.permissionIds ?? [] },
    })
    return serialize(serializeRole(role))
  }

  async update(ctx: HttpContext) {
    const { auth, params, request, response, serialize } = ctx
    const role = await Role.findOrFail(params.id)
    if (role.isSystem) {
      return response.forbidden({ message: '系统内置角色不可编辑' })
    }
    const payload = await request.validateUsing(updateRoleValidator)
    role.name = payload.name
    role.description = payload.description ?? null
    await role.save()
    if (payload.permissionIds) {
      if (!(await ensurePermissionIds(payload.permissionIds))) {
        return response.badRequest({ message: '包含不存在的权限' })
      }
      await role.related('permissions').sync(payload.permissionIds)
    }
    await role.load('permissions')
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'role.updated',
      targetType: 'role',
      targetId: role.id,
      metadata: { permissionIds: payload.permissionIds ?? [] },
    })
    return serialize(serializeRole(role))
  }

  async destroy(ctx: HttpContext) {
    const { auth, params, response, serialize } = ctx
    const role = await Role.query().where('id', params.id).withCount('users').firstOrFail()
    if (role.isSystem) {
      return response.forbidden({ message: '系统内置角色不可删除' })
    }
    if (Number(role.$extras.users_count ?? 0) > 0) {
      return response.conflict({ message: '角色仍分配给用户，无法删除' })
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
