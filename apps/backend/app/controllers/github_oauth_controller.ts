import { randomBytes, timingSafeEqual } from 'node:crypto'

import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse } from '@foadonis/openapi/decorators'

import { isTurnstileEnabled, verifyTurnstileToken } from '#integrations/turnstile'
import User from '#models/user'
import { createTwoFactorTempToken } from '#security/two_factor_token'
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
  @ApiResponse({ status: 302, description: '重定向至 GitHub 授权页' })
  async redirect({ response, session }: HttpContext) {
    if (!githubOAuthIsConfigured()) {
      throw githubOAuthErrors.notConfigured
    }

    const state = randomBytes(32).toString('base64url')
    session.put(SESSION_STATE_KEY, state)
    return response.redirect(githubAuthorizationUrl(state))
  }

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
  @ApiResponse({ status: 200, description: '绑定后的登录结果或 2FA 临时凭据' })
  async complete({ request, session, serialize }: HttpContext) {
    const payload = await request.validateUsing(githubLoginCompletionValidator)
    if (
      isTurnstileEnabled() &&
      !(await verifyTurnstileToken(payload.turnstileToken ?? '', request.ip()))
    ) {
      throw { code: 'E_TURNSTILE_FAILED', status: 403 }
    }
    const challengeCode =
      payload.code || (session.get(SESSION_LOGIN_CHALLENGE_KEY) as string | undefined)
    if (!challengeCode) throw githubOAuthErrors.invalidExchange
    const { identity } = await readGithubLoginChallenge(challengeCode)
    const user = await User.findBy('email', payload.email)
    if (!user || user.disabledAt) throw githubOAuthErrors.accountNotLinked
    const verifiedUser = await User.verifyCredentials(user.email, payload.password).catch(
      () => null
    )
    if (!verifiedUser) throw { code: 'E_INVALID_CREDENTIALS', status: 401 }
    await consumeGithubLoginChallenge(challengeCode)
    session.forget(SESSION_LOGIN_CHALLENGE_KEY)
    await linkGithubIdentity(user, identity)

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

  @ApiOperation({ summary: '发起 GitHub 账号绑定' })
  @ApiResponse({ status: 200, description: 'GitHub 授权地址' })
  async beginLink({ auth, response }: HttpContext) {
    if (!githubOAuthIsConfigured()) throw githubOAuthErrors.notConfigured
    const state = await createGithubLinkState(auth.getUserOrFail().id)
    return response.ok({ data: { url: githubAuthorizationUrl(state) } })
  }

  @ApiOperation({ summary: '兑换 GitHub 授权登录凭据' })
  @ApiResponse({ status: 200, description: '登录结果和访问 token' })
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
