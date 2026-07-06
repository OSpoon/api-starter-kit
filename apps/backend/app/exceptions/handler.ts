import { ExceptionHandler, type HttpContext } from '@adonisjs/core/http'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = false

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    const exception = error as {
      code?: string
      status?: number
      message?: string
    }
    const status = exception.status ?? 500

    if (status >= 500) {
      await this.report(error, ctx)
      return ctx.response.status(500).send({
        message: '服务器内部错误，请稍后重试',
      })
    }

    if (exception.code === 'E_INVALID_CREDENTIALS') {
      return ctx.response.unauthorized({
        message: '邮箱或密码错误',
      })
    }

    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
