import type { HttpContext } from '@adonisjs/core/http'

import Permission from '#models/permission'
import { recordAuditEvent } from '#services/audit_log'
import { createPermissionValidator, updatePermissionValidator } from '#validators/rbac'

function serializePermission(permission: Permission) {
  return {
    id: permission.id,
    code: permission.code,
    name: permission.name,
    groupName: permission.groupName,
    description: permission.description,
    isSystem: permission.isSystem,
    roleCount: Number(permission.$extras.roles_count ?? 0),
  }
}

export default class PermissionsController {
  async index({ serialize }: HttpContext) {
    const permissions = await Permission.query()
      .withCount('roles')
      .orderBy('group_name')
      .orderBy('code')
    return serialize(permissions.map(serializePermission))
  }

  async store(ctx: HttpContext) {
    const { auth, request, serialize } = ctx
    const payload = await request.validateUsing(createPermissionValidator)
    const permission = await Permission.create({
      ...payload,
      description: payload.description ?? null,
    })
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'permission.created',
      targetType: 'permission',
      targetId: permission.id,
      metadata: { code: permission.code },
    })
    return serialize(serializePermission(permission))
  }

  async update(ctx: HttpContext) {
    const { auth, params, request, response, serialize } = ctx
    const permission = await Permission.findOrFail(params.id)
    if (permission.isSystem) return response.forbidden({ message: '系统内置权限不可编辑' })
    const payload = await request.validateUsing(updatePermissionValidator)
    permission.merge({ ...payload, description: payload.description ?? null })
    await permission.save()
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'permission.updated',
      targetType: 'permission',
      targetId: permission.id,
      metadata: { code: permission.code },
    })
    return serialize(serializePermission(permission))
  }

  async destroy(ctx: HttpContext) {
    const { auth, params, response, serialize } = ctx
    const permission = await Permission.query()
      .where('id', params.id)
      .withCount('roles')
      .firstOrFail()
    if (permission.isSystem) return response.forbidden({ message: '系统内置权限不可删除' })
    if (Number(permission.$extras.roles_count ?? 0) > 0) {
      return response.conflict({ message: '权限仍被角色引用，无法删除' })
    }
    await permission.delete()
    await recordAuditEvent(ctx, {
      actorUserId: auth.getUserOrFail().id,
      action: 'permission.deleted',
      targetType: 'permission',
      targetId: permission.id,
      metadata: { code: permission.code },
    })
    return serialize({ id: permission.id, deleted: true })
  }
}
