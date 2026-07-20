import { ExceptionHandler, type HttpContext } from '@adonisjs/core/http'

/**
 * Maps known AdonisJS / application error codes to stable machine-readable
 * response codes with English fallback messages. The frontend is expected to
 * map these codes to localized user-visible text via its i18n layer.
 */
const ERROR_CODE_MAP: Record<string, { status: number; code: string; message: string }> = {
  E_INVALID_CREDENTIALS: {
    status: 401,
    code: 'E_AUTH_INVALID_CREDENTIALS',
    message: 'Invalid email or password',
  },
  E_AUTH_UNAUTHORIZED: {
    status: 403,
    code: 'E_AUTH_UNAUTHORIZED',
    message: 'Insufficient permissions',
  },
  E_RATE_LIMIT_EXCEEDED: {
    status: 429,
    code: 'E_RATE_LIMIT_EXCEEDED',
    message: 'Too many requests',
  },
  E_ROW_NOT_FOUND: {
    status: 404,
    code: 'E_RESOURCE_NOT_FOUND',
    message: 'Resource not found',
  },
}

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
      retryAfter?: number
    }

    // Check the error code map first so that mapped codes (including
    // those with status >= 500) are handled before the generic 500
    // catch-all converts them to E_INTERNAL_ERROR.
    const mapped = exception.code ? ERROR_CODE_MAP[exception.code] : undefined
    if (mapped) {
      const body: Record<string, unknown> = {
        code: mapped.code,
        message: mapped.message,
      }
      if (exception.retryAfter !== undefined) {
        body.retryAfter = exception.retryAfter
        ctx.response.header('Retry-After', String(exception.retryAfter))
      }
      return ctx.response.status(mapped.status).send(body)
    }

    const status = exception.status ?? 500
    if (status >= 500) {
      await this.report(error, ctx)
      return ctx.response.status(500).send({
        code: 'E_INTERNAL_ERROR',
        message: 'Internal server error',
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
