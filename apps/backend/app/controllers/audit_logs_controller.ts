import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import AuditLog from '#models/audit_log'
import { clampLimit } from '#support/pagination'
import { auditLogsQueryValidator } from '#validators/audit_logs'

function serializeAuditLog(log: AuditLog) {
  return {
    id: log.id,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    eventVersion: log.eventVersion,
    actorType: log.actorType,
    source: log.source,
    outcome: log.outcome,
    reasonCode: log.reasonCode,
    metadata: log.metadata,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    requestId: log.requestId,
    traceId: log.traceId,
    requestMethod: log.requestMethod,
    requestRoute: log.requestRoute,
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
      '返回标准化审计事件分页列表，包含操作者类型、来源、结果、原因、请求路由与关联 ID。支持按来源、结果、操作者类型筛选，并按操作、目标、IP 地址、请求 ID、追踪 ID 和操作者姓名或邮箱搜索。',
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
      '搜索操作、目标、来源、原因、路由、IP 地址、请求 ID、追踪 ID 或操作者；去除首尾空格，空值不过滤，最多 200 个字符',
    schema: { type: 'string', maxLength: 200 },
  })
  @ApiQuery({
    name: 'source',
    required: false,
    description: '来源筛选，多个值用逗号分隔',
    schema: { type: 'string' },
  })
  @ApiQuery({
    name: 'outcome',
    required: false,
    description: '结果筛选，多个值用逗号分隔',
    schema: { type: 'string' },
  })
  @ApiQuery({
    name: 'actorType',
    required: false,
    description: '操作者类型筛选，多个值用逗号分隔',
    schema: { type: 'string' },
  })
  @ApiResponse({
    status: 200,
    description: '审计日志分页列表，事件包含来源、结果、原因、请求路由和 request/trace ID。',
  })
  async index({ request, serialize }: HttpContext) {
    const payload = await auditLogsQueryValidator.validate(request.qs())
    const search = payload.search ?? ''
    const query = AuditLog.query().preload('actor').orderBy('id', 'desc')
    if (payload.source) query.whereIn('source', payload.source.split(','))
    if (payload.outcome) query.whereIn('outcome', payload.outcome.split(','))
    if (payload.actorType) query.whereIn('actor_type', payload.actorType.split(','))
    if (search) {
      query.where((builder) => {
        builder
          .whereILike('action', `%${search}%`)
          .orWhereILike('target_type', `%${search}%`)
          .orWhereILike('target_id', `%${search}%`)
          .orWhereILike('source', `%${search}%`)
          .orWhereILike('outcome', `%${search}%`)
          .orWhereILike('reason_code', `%${search}%`)
          .orWhereILike('ip_address', `%${search}%`)
          .orWhereILike('request_id', `%${search}%`)
          .orWhereILike('trace_id', `%${search}%`)
          .orWhereILike('request_route', `%${search}%`)
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
