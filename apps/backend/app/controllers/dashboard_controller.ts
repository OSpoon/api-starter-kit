import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import { getDashboardOverview } from '#services/dashboard_service'

@ApiSecurity('bearerAuth')
export default class DashboardController {
  @ApiOperation({
    summary: '获取系统数据概览',
    description: '返回系统核心数据统计和近 7 天趋势。无对应模块读取权限时，相关字段为 null。',
  })
  @ApiResponse({ status: 200, description: '系统数据概览' })
  async overview({ bouncer, serialize }: HttpContext) {
    return serialize(await getDashboardOverview(bouncer))
  }
}
