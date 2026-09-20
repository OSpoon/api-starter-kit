import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import AuditLog from '#models/audit_log'
import { clampLimit } from '#support/pagination'
import { paginationSearchQueryValidator } from '#validators/pagination'

function serializeAuditLog(log: AuditLog) {
  return {
    id: log.id,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    metadata: log.metadata,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    requestId: log.requestId,
    createdAt: log.createdAt,
    actor: log.actor
      ? { id: log.actor.id, fullName: log.actor.fullName, email: log.actor.email }
      : null,
  }
}

@ApiSecurity('bearerAuth')
export default class AuditLogsController {
  @ApiOperation({
    summary: '获取审计日志列表',
    description:
      '返回审计日志分页列表。支持按操作、目标、IP 地址、请求 ID 和操作者姓名或邮箱搜索。',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: '页码，从 1 开始',
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '每页数量，默认 20，最大 100',
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description:
      '搜索操作、目标、IP 地址、请求 ID 或操作者；去除首尾空格，空值不过滤，最多 200 个字符',
    schema: { type: 'string', maxLength: 200 },
  })
  @ApiResponse({ status: 200, description: '审计日志分页列表' })
  async index({ request, serialize }: HttpContext) {
    const payload = await paginationSearchQueryValidator.validate(request.qs())
    const search = payload.search ?? ''
    const query = AuditLog.query().preload('actor').orderBy('id', 'desc')
    if (search) {
      query.where((builder) => {
        builder
          .whereILike('action', `%${search}%`)
          .orWhereILike('target_type', `%${search}%`)
          .orWhereILike('target_id', `%${search}%`)
          .orWhereILike('ip_address', `%${search}%`)
          .orWhereILike('request_id', `%${search}%`)
          .orWhereHas('actor', (actor) => {
            actor.whereILike('full_name', `%${search}%`).orWhereILike('email', `%${search}%`)
          })
      })
    }
    const paginator = await query.paginate(payload.page ?? 1, clampLimit(payload.limit, 20, 100))

    return serialize({
      items: paginator.all().map(serializeAuditLog),
      meta: paginator.getMeta(),
    })
  }
}
