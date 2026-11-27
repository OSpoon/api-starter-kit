import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import { getDashboardOverview } from '#services/dashboard_service'

import { dataEnvelope } from '../openapi/response_schemas.js'

@ApiSecurity('bearerAuth')
export default class DashboardController {
  @ApiOperation({
    summary: '获取系统数据概览',
    description: '返回系统核心数据统计和近 7 天趋势。无对应模块读取权限时，相关字段为 null。',
  })
  @ApiResponse({
    status: 200,
    description: '系统数据概览；没有对应读取权限的模块字段为 null。',
    schema: dataEnvelope({
      type: 'object',
      required: [
        'generatedAt',
        'activeUsers',
        'roles',
        'activeApiKeys',
        'knowledgeDocuments',
        'auditEvents',
        'aiModelCalls',
        'aiTokensUsed',
        'auditTrend',
        'aiCallTrend',
      ],
      properties: {
        generatedAt: { type: 'string', format: 'date-time' },
        activeUsers: { type: 'integer', nullable: true },
        roles: { type: 'integer', nullable: true },
        activeApiKeys: { type: 'integer', nullable: true },
        knowledgeDocuments: { type: 'integer', nullable: true },
        auditEvents: { type: 'integer', nullable: true },
        aiModelCalls: { type: 'integer', nullable: true },
        aiTokensUsed: { type: 'integer', nullable: true },
        auditTrend: {
          type: 'array',
          nullable: true,
          items: {
            type: 'object',
            required: ['date', 'count'],
            properties: { date: { type: 'string', format: 'date' }, count: { type: 'integer' } },
          },
        },
        aiCallTrend: {
          type: 'array',
          nullable: true,
          items: {
            type: 'object',
            required: ['date', 'count'],
            properties: { date: { type: 'string', format: 'date' }, count: { type: 'integer' } },
          },
        },
      },
    }),
  })
  async overview({ bouncer, serialize }: HttpContext) {
    return serialize(await getDashboardOverview(bouncer))
  }
}
