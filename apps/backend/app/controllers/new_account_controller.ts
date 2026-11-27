import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse } from '@foadonis/openapi/decorators'

import { errorResponseSchema } from '../openapi/response_schemas.js'

export default class NewAccountController {
  @ApiOperation({
    summary: '创建管理员账号',
    description: '公共注册已关闭；管理员账号只能通过 ADMIN_EMAIL 和 ADMIN_PASSWORD 初始化。',
  })
  @ApiResponse({
    status: 403,
    description: '公共注册不可用',
    schema: errorResponseSchema,
  })
  async store({ response }: HttpContext) {
    return response.forbidden({
      message: '管理员账号由环境变量自动创建，请使用 ADMIN_EMAIL 和 ADMIN_PASSWORD 配置。',
    })
  }
}
