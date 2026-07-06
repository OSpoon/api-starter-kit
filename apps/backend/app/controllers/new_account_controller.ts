import type { HttpContext } from '@adonisjs/core/http'

export default class NewAccountController {
  async store({ response }: HttpContext) {
    return response.forbidden({
      message: '管理员账号由环境变量自动创建，请使用 ADMIN_EMAIL 和 ADMIN_PASSWORD 配置。',
    })
  }
}
