import { randomBytes, timingSafeEqual } from 'node:crypto'

import type { HttpContext } from '@adonisjs/core/http'
import { ApiOperation, ApiResponse } from '@foadonis/openapi/decorators'

import User from '#models/user'
import {
  consumeGithubLoginExchange,
  createGithubLoginExchange,
  fetchGithubIdentity,
  findOrLinkGithubUser,
  githubAuthorizationUrl,
  githubFrontendLoginUrl,
  githubOAuthErrors,
  githubOAuthIsConfigured,
} from '#services/github_oauth'
import { createTwoFactorTempToken } from '#services/two_factor_token'
import { loadUserAccess } from '#services/user_access'
import UserTransformer from '#transformers/user_transformer'

const SESSION_STATE_KEY = 'github_oauth_state'

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

      const identity = await fetchGithubIdentity(code)
      if (!validState(state, callbackState)) throw githubOAuthErrors.invalidState
      const user = await findOrLinkGithubUser(identity)
      const exchangeCode = await createGithubLoginExchange(user.id)
      return response.redirect(
        githubFrontendLoginUrl(process.env.GITHUB_OAUTH_FRONTEND_URL!, {
          github_code: exchangeCode,
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

  @ApiOperation({ summary: '兑换 GitHub 授权登录凭据' })
  @ApiResponse({ status: 200, description: '登录结果和访问 token' })
  async exchange({ request, serialize }: HttpContext) {
    const code = request.input('code')
    if (typeof code !== 'string' || !code) {
      throw githubOAuthErrors.invalidExchange
    }
    const user = await consumeGithubLoginExchange(code)
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
