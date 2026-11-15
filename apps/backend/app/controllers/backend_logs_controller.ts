import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse, ApiSecurity } from '@foadonis/openapi/decorators'

import { subscribeToBackendLogs } from '#services/backend_log_stream_service'

@ApiSecurity('bearerAuth')
export default class BackendLogsController {
  @ApiOperation({
    summary: '实时查看 API 后端日志',
    description: '以 Server-Sent Events 实时输出当前 API 容器的应用日志。',
  })
  @ApiResponse({ status: 200, description: 'text/event-stream 日志事件流' })
  live({ response }: HttpContext) {
    response.header('Content-Type', 'text/event-stream; charset=utf-8')
    response.header('Cache-Control', 'no-cache, no-transform')
    response.header('Connection', 'keep-alive')
    response.header('X-Accel-Buffering', 'no')
    response.response.writeHead(200)
    // Flush the SSE handshake so fetch resolves before the first log line arrives.
    response.response.write(': connected\n\n')
    subscribeToBackendLogs(response.response)
  }
}
