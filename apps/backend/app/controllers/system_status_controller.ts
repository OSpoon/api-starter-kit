import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import { getAiUsageOverview } from '#services/ai_usage_service'
import { readSystemStatus } from '#services/system_status_service'

@ApiSecurity('bearerAuth')
export default class SystemStatusController {
  @ApiOperation({
    summary: '获取服务器状态',
    description: '返回服务器资源、当前应用运行时，以及企业微信、飞书和钉钉 Bot worker 进程状态。',
  })
  @ApiResponse({
    status: 200,
    description:
      '服务器状态快照；diskCollectionAvailable 为 false 时磁盘采集失败，此时 disks 为空数组；diskCollectionAvailable 为 true 且 disks 为空时没有可用挂载点。IM Bot 状态依据最近 30 秒的数据库心跳判断，只反映进程存活。CPU 首次采样时使用率为空，运行时无法读取的物理核数或活动句柄计数也为空。',
  })
  async show({ serialize }: HttpContext) {
    return serialize(await readSystemStatus())
  }

  @ApiOperation({
    summary: '获取 AI 服务概览',
    description: '返回当前月份全服务的模型调用次数、token 消耗和估算消费。',
  })
  @ApiResponse({ status: 200, description: 'AI 服务概览' })
  async aiOverview({ serialize }: HttpContext) {
    return serialize(await getAiUsageOverview())
  }
}
