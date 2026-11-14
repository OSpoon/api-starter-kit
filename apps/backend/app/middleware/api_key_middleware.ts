import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

import type ApiKey from '#models/api_key'
import type { ChannelName } from '#models/channel_identity'
import type User from '#models/user'
import { authenticateApiKey } from '#services/api_key_service'
import { getAiIntegrationUser } from '#services/channel_guest_principal'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    integrationApiKey?: ApiKey
    integrationUser?: User
    auditChannel?: ChannelName
  }
}

export default class ApiKeyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const raw =
      ctx.request.header('x-api-key') ??
      ctx.request.header('authorization')?.replace(/^Bearer\s+/i, '')
    const apiKey = await authenticateApiKey(raw)

    if (!apiKey) {
      return ctx.response.unauthorized({ message: 'Invalid API key' })
    }

    ctx.integrationApiKey = apiKey
    ctx.integrationUser = await getAiIntegrationUser()
    return next()
  }
}
