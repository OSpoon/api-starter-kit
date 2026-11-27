import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import AuditLog from '#models/audit_log'
import { clampLimit } from '#support/pagination'
import { auditLogsQueryValidator } from '#validators/audit_logs'

import { paginatedDataEnvelope } from '../openapi/response_schemas.js'

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
      '返回标准化审计事件分页列表。可按操作、目标类型、目标 ID、操作者姓名和邮箱分别筛选，也支持来源、结果和操作者类型筛选。',
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
  @ApiQuery({ name: 'action', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({ name: 'targetType', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({ name: 'targetId', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({ name: 'actorName', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({ name: 'actorEmail', required: false, schema: { type: 'string', maxLength: 254 } })
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
    schema: paginatedDataEnvelope({
      type: 'object',
      required: [
        'id',
        'action',
        'targetType',
        'eventVersion',
        'actorType',
        'source',
        'outcome',
        'metadata',
        'createdAt',
        'actor',
      ],
      properties: {
        id: { type: 'integer' },
        action: { type: 'string' },
        targetType: { type: 'string' },
        targetId: { type: 'string', nullable: true },
        eventVersion: { type: 'integer' },
        actorType: { type: 'string' },
        source: { type: 'string' },
        outcome: { type: 'string' },
        reasonCode: { type: 'string', nullable: true },
        metadata: { type: 'object', additionalProperties: true },
        ipAddress: { type: 'string', nullable: true },
        userAgent: { type: 'string', nullable: true },
        requestId: { type: 'string', nullable: true },
        traceId: { type: 'string', nullable: true },
        requestMethod: { type: 'string', nullable: true },
        requestRoute: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        actor: {
          type: 'object',
          nullable: true,
          required: ['id', 'fullName', 'email'],
          properties: {
            id: { type: 'integer' },
            fullName: { type: 'string' },
            email: { type: 'string', format: 'email' },
          },
        },
      },
    }),
  })
  async index({ request, serialize }: HttpContext) {
    const payload = await auditLogsQueryValidator.validate(request.qs())
    const query = AuditLog.query().preload('actor').orderBy('id', 'desc')
    if (payload.source) query.whereIn('source', payload.source.split(','))
    if (payload.outcome) query.whereIn('outcome', payload.outcome.split(','))
    if (payload.actorType) query.whereIn('actor_type', payload.actorType.split(','))
    if (payload.action) query.whereILike('action', `%${payload.action}%`)
    if (payload.targetType) query.whereILike('target_type', `%${payload.targetType}%`)
    if (payload.targetId) query.whereILike('target_id', `%${payload.targetId}%`)
    if (payload.actorName)
      query.whereHas('actor', (actor) => actor.whereILike('full_name', `%${payload.actorName}%`))
    if (payload.actorEmail)
      query.whereHas('actor', (actor) => actor.whereILike('email', `%${payload.actorEmail}%`))
    const paginator = await query.paginate(payload.page ?? 1, clampLimit(payload.limit, 20, 100))

    return serialize({
      items: paginator.all().map(serializeAuditLog),
      meta: paginator.getMeta(),
    })
  }
}
