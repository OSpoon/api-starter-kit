import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { ApiOperation, ApiResponse } from '@foadonis/openapi/decorators'

export default class HealthController {
  @ApiOperation({ summary: '检查 API 服务状态' })
  @ApiResponse({
    status: 200,
    description: 'API 服务可用',
    schema: {
      type: 'object',
      required: ['status'],
      properties: { status: { type: 'string', enum: ['ok'] } },
    },
  })
  show() {
    return { status: 'ok' }
  }

  @ApiOperation({ summary: '检查 API 依赖就绪状态' })
  @ApiResponse({
    status: 200,
    description: '数据库连接正常',
    schema: {
      type: 'object',
      required: ['status', 'checks'],
      properties: {
        status: { type: 'string', enum: ['ok'] },
        checks: {
          type: 'object',
          required: ['database', 'ai'],
          properties: {
            database: { type: 'string', enum: ['ok'] },
            ai: { type: 'string', enum: ['runtime_configured'] },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: '数据库连接不可用',
    schema: {
      type: 'object',
      required: ['status', 'checks'],
      properties: {
        status: { type: 'string', enum: ['error'] },
        checks: {
          type: 'object',
          required: ['database', 'ai'],
          properties: {
            database: { type: 'string', enum: ['error'] },
            ai: { type: 'string', enum: ['runtime_configured'] },
          },
        },
      },
    },
  })
  async ready({ response }: HttpContext) {
    const checks: Record<string, string> = {}
    let healthy = true

    try {
      await db.rawQuery('SELECT 1')
      checks.database = 'ok'
    } catch {
      checks.database = 'error'
      healthy = false
    }

    checks.ai = 'runtime_configured'

    if (!healthy) return response.status(503).send({ status: 'error', checks })
    return { status: 'ok', checks }
  }
}
