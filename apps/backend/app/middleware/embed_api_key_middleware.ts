import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

import { authenticateApiKey } from '#services/api_key_service'
import { getAiIntegrationUser } from '#services/channel_guest_principal'
import { embedSessionValidator } from '#validators/embed_session'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    embedSessionId?: string
  }
}

export default class EmbedApiKeyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const raw =
      ctx.request.header('x-api-key') ??
      ctx.request.header('authorization')?.replace(/^Bearer\s+/i, '')
    const apiKey = await authenticateApiKey(raw)

    if (!apiKey || apiKey.kind !== 'embed') {
      return ctx.response.unauthorized({ message: 'Invalid embed API key' })
    }

    const { sessionId } = await ctx.request.validateUsing(embedSessionValidator, {
      data: { sessionId: ctx.request.header('x-embed-session') },
    })

    ctx.integrationApiKey = apiKey
    ctx.integrationUser = await getAiIntegrationUser()
    ctx.embedSessionId = sessionId
    return next()
  }
}
