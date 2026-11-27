import { randomBytes, timingSafeEqual } from 'node:crypto'

import type { HttpContext } from '@adonisjs/core/http'
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@foadonis/openapi/decorators'

import { isTurnstileEnabled, verifyTurnstileToken } from '#integrations/turnstile'
import User from '#models/user'
import { createTwoFactorTempToken } from '#security/two_factor_token'
import { verifyUserCredentials } from '#security/user_credentials'
import { recordAuditEvent } from '#services/audit_log'
import {
  consumeGithubLinkState,
  consumeGithubLoginChallenge,
  consumeGithubLoginExchange,
  createGithubLinkState,
  createGithubLoginChallenge,
  createGithubLoginExchange,
  fetchGithubIdentity,
  findOrLinkGithubUser,
  githubAuthorizationUrl,
  githubFrontendLoginUrl,
  githubOAuthErrors,
  githubOAuthIsConfigured,
  linkGithubIdentity,
  readGithubLoginChallenge,
} from '#services/github_oauth'
import { loadUserAccess } from '#services/user_access'
import UserTransformer from '#transformers/user_transformer'
import { githubLoginCompletionValidator } from '#validators/user'

import {
  authenticatedUserSchema,
  dataEnvelope,
  errorResponseSchema,
} from '../openapi/response_schemas.js'

const SESSION_STATE_KEY = 'github_oauth_state'
const SESSION_LOGIN_CHALLENGE_KEY = 'github_login_challenge'
const SESSION_LOGIN_EXCHANGE_KEY = 'github_login_exchange'

function validState(expected: string | undefined, received: string | undefined) {
  if (!expected || !received || expected.length !== received.length) {
    return false
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
}

export default class GithubOauthController {
  @ApiOperation({ summary: '发起 GitHub 授权登录' })
  @ApiResponse({
    status: 302,
    description: '重定向至 GitHub 授权页',
    mediaType: 'text/html',
    schema: { type: 'string' },
  })
  async redirect({ response, session }: HttpContext) {
    if (!githubOAuthIsConfigured()) {
      throw githubOAuthErrors.notConfigured
    }

    const state = randomBytes(32).toString('base64url')
    session.put(SESSION_STATE_KEY, state)
    return response.redirect(githubAuthorizationUrl(state))
  }

  @ApiOperation({
    summary: '处理 GitHub OAuth 回调',
    description: '验证 OAuth state 并完成登录或账号绑定，然后重定向到前端回调页。',
  })
  @ApiQuery({ name: 'code', required: true, schema: { type: 'string', minLength: 1 } })
  @ApiQuery({ name: 'state', required: true, schema: { type: 'string', minLength: 1 } })
  @ApiResponse({
    status: 302,
    description: '重定向至前端登录或账号绑定结果页',
    mediaType: 'text/html',
    schema: { type: 'string' },
  })
  async callback({ request, response, session }: HttpContext) {
    if (!githubOAuthIsConfigured()) {
      throw githubOAuthErrors.notConfigured
    }

    const state = session.get(SESSION_STATE_KEY) as string | undefined
    session.forget(SESSION_STATE_KEY)

    try {
      const callbackState = request.input('state')
      const code = request.input('code')
      if (typeof code !== 'string' || !code) {
        throw githubOAuthErrors.authorizationFailed
      }

      const isLinkFlow = typeof callbackState === 'string' && callbackState.startsWith('link_')
      if (!isLinkFlow && !validState(state, callbackState)) {
        throw githubOAuthErrors.invalidState
      }
      const identity = await fetchGithubIdentity(code)
      if (isLinkFlow) {
        const user = await consumeGithubLinkState(callbackState as string)
        await linkGithubIdentity(user, identity)
        return response.redirect(
          githubFrontendLoginUrl(process.env.GITHUB_OAUTH_FRONTEND_URL!, { github_linked: '1' })
        )
      }
      let user
      try {
        user = await findOrLinkGithubUser(identity)
      } catch (error) {
        if (
          typeof error === 'object' &&
          error &&
          'code' in error &&
          error.code === githubOAuthErrors.accountNotLinked.code
        ) {
          const challenge = await createGithubLoginChallenge(identity)
          session.put(SESSION_LOGIN_CHALLENGE_KEY, challenge)
          return response.redirect(
            githubFrontendLoginUrl(process.env.GITHUB_OAUTH_FRONTEND_URL!, {
              github_pending: '1',
            })
          )
        }
        throw error
      }
      const exchangeCode = await createGithubLoginExchange(user.id)
      session.put(SESSION_LOGIN_EXCHANGE_KEY, exchangeCode)
      return response.redirect(
        githubFrontendLoginUrl(process.env.GITHUB_OAUTH_FRONTEND_URL!, {
          github_exchange: '1',
        })
      )
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String(error.code)
          : 'E_GITHUB_OAUTH_AUTHORIZATION_FAILED'
      return response.redirect(
        githubFrontendLoginUrl(process.env.GITHUB_OAUTH_FRONTEND_URL!, { github_error: code })
      )
    }
  }

  @ApiOperation({ summary: '验证本地账号并完成 GitHub 登录绑定' })
  @ApiBody({ type: () => githubLoginCompletionValidator, required: true })
  @ApiResponse({
    status: 200,
    description: '返回访问 Token，或要求完成 2FA 的临时凭据。',
    schema: dataEnvelope({
      type: 'object',
      required: ['requiresPasswordChange'],
      properties: {
        user: authenticatedUserSchema,
        token: { type: 'string' },
        requiresTwoFactor: { type: 'boolean' },
        tempToken: { type: 'string' },
        requiresPasswordChange: { type: 'boolean' },
      },
    }),
  })
  @ApiResponse({ status: 401, description: '本地账号密码无效', schema: errorResponseSchema })
  @ApiResponse({ status: 403, description: 'Turnstile 验证失败', schema: errorResponseSchema })
  @ApiResponse({ status: 422, description: '请求字段无效', schema: errorResponseSchema })
  async complete(ctx: HttpContext) {
    const { request, session, serialize } = ctx
    const payload = await request.validateUsing(githubLoginCompletionValidator)
    if (
      isTurnstileEnabled() &&
      !(await verifyTurnstileToken(payload.turnstileToken ?? '', request.ip()))
    ) {
      await recordAuditEvent(ctx, {
        actorUserId: null,
        actorType: 'anonymous',
        action: 'auth.login_rejected',
        targetType: 'authentication',
        outcome: 'denied',
        reasonCode: 'turnstile_failed',
        metadata: { authenticationMethod: 'github' },
      })
      throw { code: 'E_TURNSTILE_FAILED', status: 403 }
    }
    const challengeCode =
      payload.code || (session.get(SESSION_LOGIN_CHALLENGE_KEY) as string | undefined)
    if (!challengeCode) {
      await recordAuditEvent(ctx, {
        actorUserId: null,
        actorType: 'anonymous',
        action: 'auth.login_rejected',
        targetType: 'authentication',
        outcome: 'denied',
        reasonCode: 'invalid_exchange',
        metadata: { authenticationMethod: 'github' },
      })
      throw githubOAuthErrors.invalidExchange
    }
    const { identity } = await readGithubLoginChallenge(challengeCode)
    const user = await User.findBy('email', payload.email)
    if (!user || user.disabledAt) {
      await recordAuditEvent(ctx, {
        actorUserId: null,
        actorType: 'anonymous',
        action: 'auth.login_rejected',
        targetType: 'authentication',
        outcome: 'denied',
        reasonCode: 'account_not_linked',
        metadata: { authenticationMethod: 'github' },
      })
      throw githubOAuthErrors.accountNotLinked
    }
    const verifiedUser = await verifyUserCredentials(user.email, payload.password)
    if (!verifiedUser) {
      await recordAuditEvent(ctx, {
        actorUserId: null,
        actorType: 'anonymous',
        action: 'auth.login_rejected',
        targetType: 'user',
        targetId: user.id,
        outcome: 'failure',
        reasonCode: 'invalid_credentials',
        metadata: { authenticationMethod: 'github' },
      })
      throw { code: 'E_INVALID_CREDENTIALS', status: 401 }
    }
    await consumeGithubLoginChallenge(challengeCode)
    session.forget(SESSION_LOGIN_CHALLENGE_KEY)
    await linkGithubIdentity(user, identity)

    if (user.twoFactorEnabled) {
      await recordAuditEvent(ctx, {
        actorUserId: user.id,
        action: 'auth.login_challenged',
        targetType: 'user',
        targetId: user.id,
        outcome: 'attempted',
        reasonCode: 'two_factor_required',
        metadata: { authenticationMethod: 'github' },
      })
      return serialize({
        requiresTwoFactor: true,
        tempToken: createTwoFactorTempToken(user.id),
        requiresPasswordChange: false,
      })
    }
    const token = await User.accessTokens.create(user)
    await recordAuditEvent(ctx, {
      actorUserId: user.id,
      action: 'auth.login_succeeded',
      targetType: 'user',
      targetId: user.id,
      metadata: { authenticationMethod: 'github' },
    })
    return serialize({
      user: UserTransformer.transform(await loadUserAccess(user)),
      token: token.value!.release(),
      requiresPasswordChange: false,
    })
  }

  @ApiOperation({ summary: '发起 GitHub 账号绑定' })
  @ApiSecurity('bearerAuth')
  @ApiResponse({
    status: 200,
    description: 'GitHub 授权地址',
    schema: dataEnvelope({
      type: 'object',
      required: ['url'],
      properties: { url: { type: 'string', format: 'uri' } },
    }),
  })
  async beginLink({ auth, response }: HttpContext) {
    if (!githubOAuthIsConfigured()) throw githubOAuthErrors.notConfigured
    const state = await createGithubLinkState(auth.getUserOrFail().id)
    return response.ok({ data: { url: githubAuthorizationUrl(state) } })
  }

  @ApiOperation({ summary: '兑换 GitHub 授权登录凭据' })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: { code: { type: 'string', minLength: 1 } },
    },
  })
  @ApiResponse({
    status: 200,
    description: '返回访问 Token，或要求完成 2FA 的临时凭据。',
    schema: dataEnvelope({
      type: 'object',
      required: ['requiresPasswordChange'],
      properties: {
        user: authenticatedUserSchema,
        token: { type: 'string' },
        requiresTwoFactor: { type: 'boolean' },
        tempToken: { type: 'string' },
        requiresPasswordChange: { type: 'boolean' },
      },
    }),
  })
  @ApiResponse({
    status: 400,
    description: 'GitHub 授权凭据无效或已过期',
    schema: errorResponseSchema,
  })
  async exchange({ request, session, serialize }: HttpContext) {
    const requestCode = request.input('code')
    const code =
      (typeof requestCode === 'string' && requestCode) ||
      (session.get(SESSION_LOGIN_EXCHANGE_KEY) as string | undefined)
    if (typeof code !== 'string' || !code) {
      throw githubOAuthErrors.invalidExchange
    }
    const user = await consumeGithubLoginExchange(code)
    session.forget(SESSION_LOGIN_EXCHANGE_KEY)
    if (user.twoFactorEnabled) {
      return serialize({
        requiresTwoFactor: true,
        tempToken: createTwoFactorTempToken(user.id),
        requiresPasswordChange: false,
      })
    }
    const token = await User.accessTokens.create(user)
    return serialize({
      user: UserTransformer.transform(await loadUserAccess(user)),
      token: token.value!.release(),
      requiresPasswordChange: false,
    })
  }
}
