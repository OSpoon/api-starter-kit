import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import { readSystemStatus } from '#services/system_status_service'

@ApiSecurity('bearerAuth')
export default class SystemStatusController {
  @ApiOperation({
    summary: '获取服务器状态',
    description: '返回当前应用进程所在服务器的 CPU、内存、磁盘和运行时信息。',
  })
  @ApiResponse({ status: 200, description: '服务器状态快照' })
  async show({ serialize }: HttpContext) {
    return serialize(await readSystemStatus())
  }
}
