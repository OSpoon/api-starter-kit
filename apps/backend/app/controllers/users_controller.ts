import type { HttpContext } from '@adonisjs/core/http'
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@foadonis/openapi/decorators'

import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'
import {
  AccessControlMutationError,
  createManagedUser,
  deleteManagedUser,
  updateManagedUser,
} from '#services/access_control_mutations'
import { recordAuditEvent } from '#services/audit_log'
import {
  AI_INTEGRATION_USER_EMAIL,
  CHANNEL_GUEST_USER_EMAIL,
  isInternalUser,
} from '#services/channel_guest_principal'
import { isSuperAdmin } from '#services/super_admin_access'
import { loadUserAccess } from '#services/user_access'
import { clampLimit } from '#support/pagination'
import UserTransformer from '#transformers/user_transformer'
import {
  createManagedUserValidator,
  listManagedUsersValidator,
  updateManagedUserValidator,
} from '#validators/rbac'

import {
  type ApiSchema,
  dataEnvelope,
  errorResponseSchema,
  paginationMetaSchema,
} from '../openapi/response_schemas.js'

function serializeUserListItem(user: User) {
  const roles = user.roles ?? []
  const permissions = new Set(
    roles.flatMap((role) => role.permissions?.map((permission) => permission.code) ?? [])
  )

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    twoFactorEnabled: user.twoFactorEnabled,
    roles: roles.map((role) => ({ id: role.id, code: role.code, name: role.name })),
    permissions: roles.some((role) => role.code === 'super-admin')
      ? ['*']
      : [...permissions].sort(),
  }
}

const userRoleSchema: ApiSchema = {
  type: 'object',
  required: ['id', 'code', 'name'],
  properties: {
    id: { type: 'integer' },
    code: { type: 'string' },
    name: { type: 'string' },
  },
}

const userListItemSchema: ApiSchema = {
  type: 'object',
  required: ['id', 'fullName', 'email', 'twoFactorEnabled', 'roles', 'permissions'],
  properties: {
    id: { type: 'integer' },
    fullName: { type: 'string' },
    email: { type: 'string', format: 'email' },
    twoFactorEnabled: { type: 'boolean' },
    roles: { type: 'array', items: userRoleSchema },
    permissions: { type: 'array', items: { type: 'string' } },
  },
}

const managedUserSchema: ApiSchema = {
  type: 'object',
  required: ['id', 'fullName', 'email', 'roles', 'permissions'],
  properties: {
    id: { type: 'integer' },
    fullName: { type: 'string' },
    email: { type: 'string', format: 'email' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    initials: { type: 'string' },
    twoFactorEnabled: { type: 'boolean' },
    passwordChangedAt: { type: 'string', format: 'date-time', nullable: true },
    roles: { type: 'array', items: userRoleSchema },
    permissions: { type: 'array', items: { type: 'string' } },
  },
} as const

@ApiSecurity('bearerAuth')
export default class UsersController {
  @ApiOperation({
    summary: '分页获取用户',
    description: '按姓名、邮箱、角色 ID 或渠道绑定状态筛选用户；不返回系统内部账号。',
  })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiQuery({ name: 'fullName', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({ name: 'email', required: false, schema: { type: 'string', maxLength: 254 } })
  @ApiQuery({ name: 'roleIds', required: false, schema: { type: 'string' } })
  @ApiQuery({ name: 'channels', required: false, schema: { type: 'string' } })
  @ApiResponse({
    status: 200,
    description: '用户分页列表及分页元数据',
    schema: dataEnvelope({
      type: 'object',
      required: ['items', 'meta'],
      properties: {
        items: { type: 'array', items: userListItemSchema },
        meta: paginationMetaSchema,
      },
    }),
  })
  @ApiResponse({ status: 422, description: '查询参数无效', schema: errorResponseSchema })
  async index({ request, serialize }: HttpContext) {
    const filters = await request.validateUsing(listManagedUsersValidator, {
      data: request.qs(),
    })
    const page = Math.max(Number(filters.page ?? 1) || 1, 1)
    const query = User.query()
      .orderBy('id')
      .preload('roles', (roles) => roles.preload('permissions'))
      .whereNotIn('email', [CHANNEL_GUEST_USER_EMAIL, AI_INTEGRATION_USER_EMAIL])
    if (filters.fullName) query.whereILike('full_name', `%${filters.fullName}%`)
    if (filters.email) query.whereILike('email', `%${filters.email}%`)

    const roleIds = (filters.roleIds?.split(',') ?? [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
    if (roleIds.length) {
      query.whereHas('roles', (rolesQuery) => rolesQuery.whereIn('roles.id', roleIds))
    }

    const channelFilters = filters.channels?.split(',') ?? []
    if (channelFilters.length) {
      const channels = channelFilters.filter(
        (channel): channel is 'wecom' | 'feishu' | 'dingtalk' =>
          channel === 'wecom' || channel === 'feishu' || channel === 'dingtalk'
      )
      const includeUnbound = channelFilters.includes('none')
      query.where((builder) => {
        if (channels.length) {
          builder.whereHas('channelIdentities', (identitiesQuery) => {
            identitiesQuery.whereIn('channel', channels).where('status', 'active')
          })
        }
        if (includeUnbound) {
          if (channels.length) {
            builder.orWhereDoesntHave('channelIdentities', (identitiesQuery) => {
              identitiesQuery.where('status', 'active')
            })
          } else {
            builder.whereDoesntHave('channelIdentities', (identitiesQuery) => {
              identitiesQuery.where('status', 'active')
            })
          }
        }
      })
    }

    const paginator = await query.paginate(page, clampLimit(filters.limit, 20, 100))
    return serialize({
      items: paginator.all().map(serializeUserListItem),
      meta: paginator.getMeta(),
    })
  }

  @ApiOperation({
    summary: '创建用户',
    description: '创建用户并返回一次性初始密码。初始密码仅在此响应中披露。',
  })
  @ApiBody({ type: () => createManagedUserValidator, required: true })
  @ApiResponse({
    status: 200,
    description: '新用户资料和仅披露一次的初始密码',
    schema: dataEnvelope({
      type: 'object',
      required: ['user', 'initialPassword'],
      properties: {
        user: managedUserSchema,
        initialPassword: { type: 'string', description: '仅在用户创建时返回一次' },
      },
    }),
  })
  @ApiResponse({ status: 400, description: '邮箱已被使用', schema: errorResponseSchema })
  @ApiResponse({ status: 403, description: '操作者无权授予该角色', schema: errorResponseSchema })
  @ApiResponse({ status: 409, description: '请求包含不存在的角色 ID', schema: errorResponseSchema })
  @ApiResponse({ status: 422, description: '用户字段校验失败', schema: errorResponseSchema })
  async store(ctx: HttpContext) {
    const { auth, request, response, serialize } = ctx
    const payload = await request.validateUsing(createManagedUserValidator)
    if (await User.findBy('email', payload.email)) {
      return response.badRequest({ message: '该邮箱已被使用' })
    }
    const initialPassword = generateInitialPassword()
    let user: User
    try {
      user = await createManagedUser({
        ctx,
        actorUserId: auth.getUserOrFail().id,
        fullName: payload.fullName,
        email: payload.email,
        password: initialPassword,
        roleIds: payload.roleIds,
        source: 'api',
      })
    } catch (error) {
      if (error instanceof AccessControlMutationError && error.code === 'invalid_role_ids') {
        return response.conflict({ message: error.message })
      }
      if (error instanceof AccessControlMutationError && error.code === 'super_admin_role_grant') {
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
    return serialize({
      user: UserTransformer.transform(await loadUserAccess(user)),
      initialPassword,
    })
  }

  @ApiOperation({ summary: '更新用户', description: '更新用户资料和角色分配。' })
  @ApiBody({ type: () => updateManagedUserValidator, required: true })
  @ApiResponse({
    status: 200,
    description: '更新后的用户资料',
    schema: dataEnvelope(managedUserSchema),
  })
  @ApiResponse({
    status: 400,
    description: '邮箱已被使用或不能移除当前账号角色',
    schema: errorResponseSchema,
  })
  @ApiResponse({
    status: 403,
    description: '目标用户或角色不可由当前操作者管理',
    schema: errorResponseSchema,
  })
  @ApiResponse({ status: 409, description: '请求包含不存在的角色 ID', schema: errorResponseSchema })
  @ApiResponse({ status: 422, description: '用户字段校验失败', schema: errorResponseSchema })
  async update(ctx: HttpContext) {
    const { auth, params, request, response, serialize } = ctx
    const user = await User.findOrFail(params.id)
    if (isInternalUser(user)) {
      return response.forbidden({ message: '系统内部用户不可管理' })
    }
    const payload = await request.validateUsing(updateManagedUserValidator)
    const currentUser = auth.getUserOrFail()
    const sameEmailUser = await User.findBy('email', payload.email)
    if (sameEmailUser && sameEmailUser.id !== user.id)
      return response.badRequest({ message: '该邮箱已被使用' })
    let updatedUser: User
    try {
      updatedUser = await updateManagedUser({
        ctx,
        actorUserId: currentUser.id,
        userId: user.id,
        fullName: payload.fullName,
        email: payload.email,
        roleIds: payload.roleIds,
        source: 'api',
      })
    } catch (error) {
      if (error instanceof AccessControlMutationError && error.code === 'invalid_role_ids') {
        return response.conflict({ message: error.message })
      }
      if (error instanceof AccessControlMutationError && error.code === 'protected_user') {
        return response.forbidden({ message: error.message })
      }
      if (
        error instanceof AccessControlMutationError &&
        error.code === 'super_admin_target_forbidden'
      ) {
        return response.forbidden({ message: error.message })
      }
      if (error instanceof AccessControlMutationError && error.code === 'super_admin_role_grant') {
        return response.forbidden({ message: error.message })
      }
      if (
        error instanceof AccessControlMutationError &&
        (error.code === 'grant_exceeds_actor_permissions' || error.code === 'inactive_actor')
      ) {
        return response.forbidden({ message: error.message })
      }
      if (
        error instanceof AccessControlMutationError &&
        (error.code === 'super_admin_roles_immutable' || error.code === 'self_role_removal')
      ) {
        return response.badRequest({ message: error.message })
      }
      throw error
    }
    return serialize(UserTransformer.transform(await loadUserAccess(updatedUser)))
  }

  @ApiOperation({
    summary: '重置用户密码',
    description: '生成新初始密码，并仅在此响应中披露一次。',
  })
  @ApiResponse({
    status: 200,
    description: '用户 ID 和仅披露一次的初始密码',
    schema: dataEnvelope({
      type: 'object',
      required: ['id', 'initialPassword'],
      properties: {
        id: { type: 'integer' },
        initialPassword: { type: 'string', description: '仅在重置时返回一次' },
      },
    }),
  })
  @ApiResponse({
    status: 400,
    description: '不能重置当前登录用户的密码',
    schema: errorResponseSchema,
  })
  @ApiResponse({
    status: 403,
    description: '目标用户不可由当前操作者管理',
    schema: errorResponseSchema,
  })
  @ApiResponse({ status: 404, description: '用户不存在', schema: errorResponseSchema })
  async resetPassword(ctx: HttpContext) {
    const { auth, params, response, serialize } = ctx
    const user = await User.findOrFail(params.id)
    if (isInternalUser(user)) {
      return response.forbidden({ message: '系统内部用户不可管理' })
    }
    const currentUser = auth.getUserOrFail()
    if (user.id === currentUser.id) {
      return response.badRequest({ message: '请通过个人资料页面修改当前账号的密码' })
    }
    if ((await isSuperAdmin(user)) && !(await isSuperAdmin(currentUser))) {
      return response.forbidden({ message: '仅超级管理员可以重置超级管理员的密码' })
    }
    const initialPassword = generateInitialPassword()
    user.password = initialPassword
    await user.save()
    await recordAuditEvent(ctx, {
      actorUserId: currentUser.id,
      action: 'user.password_reset',
      targetType: 'user',
      targetId: user.id,
    })
    return serialize({ id: user.id, initialPassword })
  }

  @ApiOperation({
    summary: '删除用户',
    description: '删除指定用户及其关联授权。不能删除当前登录用户。',
  })
  @ApiResponse({
    status: 200,
    description: '用户删除结果',
    schema: dataEnvelope({
      type: 'object',
      required: ['id', 'deleted'],
      properties: { id: { type: 'integer' }, deleted: { type: 'boolean', enum: [true] } },
    }),
  })
  @ApiResponse({ status: 400, description: '不能删除当前登录用户', schema: errorResponseSchema })
  @ApiResponse({
    status: 403,
    description: '目标用户不可由当前操作者删除',
    schema: errorResponseSchema,
  })
  @ApiResponse({ status: 404, description: '用户不存在', schema: errorResponseSchema })
  @ApiResponse({
    status: 409,
    description: '不能删除最后一名启用的超级管理员',
    schema: errorResponseSchema,
  })
  async destroy(ctx: HttpContext) {
    const { auth, params, response, serialize } = ctx
    const user = await User.findOrFail(params.id)
    if (isInternalUser(user)) {
      return response.forbidden({ message: '系统内部用户不可管理' })
    }
    const currentUser = auth.getUserOrFail()
    if (user.id === currentUser.id) return response.badRequest({ message: '不能删除当前登录账号' })
    try {
      await deleteManagedUser({
        ctx,
        actorUserId: currentUser.id,
        userId: user.id,
        source: 'api',
      })
    } catch (error) {
      if (
        error instanceof AccessControlMutationError &&
        (error.code === 'super_admin_target_forbidden' || error.code === 'inactive_actor')
      ) {
        return response.forbidden({ message: error.message })
      }
      if (
        error instanceof AccessControlMutationError &&
        error.code === 'last_enabled_super_admin'
      ) {
        return response.conflict({ message: error.message })
      }
      throw error
    }
    return serialize({ id: user.id, deleted: true })
  }
}
