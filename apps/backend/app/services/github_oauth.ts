import { createHash, randomBytes } from 'node:crypto'

import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

import GithubIdentity from '#models/github_identity'
import GithubLinkState from '#models/github_link_state'
import GithubLoginChallenge from '#models/github_login_challenge'
import GithubLoginExchange from '#models/github_login_exchange'
import User from '#models/user'

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_USER_URL = 'https://api.github.com/user'
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails'
const EXCHANGE_TTL_MINUTES = 2
const LINK_STATE_TTL_MINUTES = 10
const LOGIN_CHALLENGE_TTL_MINUTES = 10

export const githubOAuthErrors = {
  notConfigured: {
    status: 503,
    code: 'E_GITHUB_OAUTH_NOT_CONFIGURED',
    message: 'GitHub 登录尚未配置',
  },
  invalidState: {
    status: 400,
    code: 'E_GITHUB_OAUTH_INVALID_STATE',
    message: 'GitHub 授权请求已失效，请重试',
  },
  authorizationFailed: {
    status: 401,
    code: 'E_GITHUB_OAUTH_AUTHORIZATION_FAILED',
    message: 'GitHub 授权失败',
  },
  verifiedEmailRequired: {
    status: 403,
    code: 'E_GITHUB_OAUTH_VERIFIED_EMAIL_REQUIRED',
    message: 'GitHub 账号没有可用的已验证邮箱',
  },
  accountNotLinked: {
    status: 403,
    code: 'E_GITHUB_OAUTH_ACCOUNT_NOT_LINKED',
    message: '此 GitHub 邮箱未绑定现有账户',
  },
  accountConflict: {
    status: 409,
    code: 'E_GITHUB_OAUTH_ACCOUNT_CONFLICT',
    message: '此账户已绑定其他 GitHub 账号',
  },
  invalidExchange: {
    status: 401,
    code: 'E_GITHUB_OAUTH_INVALID_EXCHANGE',
    message: 'GitHub 登录凭据已失效，请重试',
  },
} as const

interface GithubUserResponse {
  id?: number
  login?: string
}

interface GithubEmailResponse {
  email?: string
  primary?: boolean
  verified?: boolean
}

function codeHash(code: string) {
  return createHash('sha256').update(code).digest('hex')
}

export function githubOAuthIsConfigured() {
  return Boolean(
    process.env.GITHUB_CLIENT_ID &&
    process.env.GITHUB_CLIENT_SECRET &&
    process.env.GITHUB_OAUTH_FRONTEND_URL
  )
}

export function githubAuthorizationUrl(state: string) {
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID!)
  url.searchParams.set('redirect_uri', `${process.env.APP_URL}/api/v1/auth/github/callback`)
  url.searchParams.set('scope', 'read:user user:email')
  url.searchParams.set('state', state)
  return url.toString()
}

export function githubFrontendLoginUrl(baseUrl: string, params: Record<string, string>) {
  const url = new URL(baseUrl)
  url.search = ''
  url.hash = ''
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

export async function fetchGithubIdentity(code: string) {
  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID!,
      client_secret: process.env.GITHUB_CLIENT_SECRET!,
      code,
      redirect_uri: `${process.env.APP_URL}/api/v1/auth/github/callback`,
    }),
  })
  const tokenPayload = (await tokenResponse.json().catch(() => null)) as {
    access_token?: string
  } | null
  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    throw githubOAuthErrors.authorizationFailed
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${tokenPayload.access_token}`,
    'User-Agent': 'api-starter-kit',
  }
  const [userResponse, emailsResponse] = await Promise.all([
    fetch(GITHUB_USER_URL, { headers }),
    fetch(GITHUB_EMAILS_URL, { headers }),
  ])
  const user = (await userResponse.json().catch(() => null)) as GithubUserResponse | null
  const emails = (await emailsResponse.json().catch(() => null)) as GithubEmailResponse[] | null
  const email =
    emails?.find((item) => item.verified && item.primary)?.email ??
    emails?.find((item) => item.verified)?.email

  if (!userResponse.ok || !emailsResponse.ok || !user?.id || !user.login) {
    throw githubOAuthErrors.authorizationFailed
  }
  if (!email) {
    throw githubOAuthErrors.verifiedEmailRequired
  }

  return { githubId: String(user.id), githubLogin: user.login, email: email.toLowerCase() }
}

export async function findOrLinkGithubUser(identity: { githubId: string }) {
  const existingIdentity = await GithubIdentity.findBy('githubId', identity.githubId)
  if (existingIdentity) {
    const user = await User.find(existingIdentity.userId)
    if (!user || user.disabledAt) {
      throw githubOAuthErrors.accountNotLinked
    }
    return user
  }
  throw githubOAuthErrors.accountNotLinked
}

export async function createGithubLoginChallenge(identity: {
  githubId: string
  githubLogin: string
  email: string
}) {
  const code = randomBytes(32).toString('base64url')
  await GithubLoginChallenge.create({
    githubId: identity.githubId,
    githubLogin: identity.githubLogin,
    githubEmail: identity.email,
    codeHash: codeHash(code),
    expiresAt: DateTime.now().plus({ minutes: LOGIN_CHALLENGE_TTL_MINUTES }),
  })
  return code
}

export async function readGithubLoginChallenge(code: string) {
  const normalizedCode = code.split('?')[0]
  const now = DateTime.now()
  const challenge = await GithubLoginChallenge.query()
    .where('code_hash', codeHash(normalizedCode))
    .whereNull('used_at')
    .where('expires_at', '>', now.toSQL()!)
    .first()
  if (!challenge) throw githubOAuthErrors.invalidExchange

  return {
    id: challenge.id,
    identity: {
      githubId: challenge.githubId,
      githubLogin: challenge.githubLogin,
      email: challenge.githubEmail,
    },
  }
}

export async function consumeGithubLoginChallenge(code: string) {
  const challenge = await readGithubLoginChallenge(code)
  const now = DateTime.now()

  const consumed = await db
    .from('github_login_challenges')
    .where('id', challenge.id)
    .whereNull('used_at')
    .update({ used_at: now.toSQL() })
    .returning('id')
  if (consumed.length !== 1) throw githubOAuthErrors.invalidExchange

  return challenge.identity
}

export async function createGithubLinkState(userId: number) {
  if (await GithubIdentity.findBy('userId', userId)) {
    throw githubOAuthErrors.accountConflict
  }
  const state = `link_${randomBytes(32).toString('base64url')}`
  await GithubLinkState.create({
    userId,
    stateHash: codeHash(state),
    expiresAt: DateTime.now().plus({ minutes: LINK_STATE_TTL_MINUTES }),
  })
  return state
}

export async function consumeGithubLinkState(state: string) {
  const now = DateTime.now()
  const linkState = await GithubLinkState.query()
    .where('state_hash', codeHash(state))
    .whereNull('used_at')
    .where('expires_at', '>', now.toSQL()!)
    .first()
  if (!linkState) throw githubOAuthErrors.invalidState

  const consumed = await db
    .from('github_link_states')
    .where('id', linkState.id)
    .whereNull('used_at')
    .update({ used_at: now.toSQL() })
    .returning('id')
  if (consumed.length !== 1) throw githubOAuthErrors.invalidState

  const user = await User.find(linkState.userId)
  if (!user || user.disabledAt) throw githubOAuthErrors.accountNotLinked
  return user
}

export async function linkGithubIdentity(
  user: User,
  identity: { githubId: string; githubLogin: string }
) {
  const existingGithubIdentity = await GithubIdentity.findBy('githubId', identity.githubId)
  if (existingGithubIdentity && existingGithubIdentity.userId !== user.id) {
    throw githubOAuthErrors.accountConflict
  }
  const existingUserIdentity = await GithubIdentity.findBy('userId', user.id)
  if (existingUserIdentity && existingUserIdentity.githubId !== identity.githubId) {
    throw githubOAuthErrors.accountConflict
  }
  if (existingGithubIdentity) return user

  await GithubIdentity.create({
    userId: user.id,
    githubId: identity.githubId,
    githubLogin: identity.githubLogin,
  })
  return user
}

export async function createGithubLoginExchange(userId: number) {
  const code = randomBytes(32).toString('base64url')
  await GithubLoginExchange.create({
    userId,
    codeHash: codeHash(code),
    expiresAt: DateTime.now().plus({ minutes: EXCHANGE_TTL_MINUTES }),
  })
  return code
}

export async function consumeGithubLoginExchange(code: string) {
  const now = DateTime.now()
  const exchange = await GithubLoginExchange.query()
    .where('code_hash', codeHash(code))
    .whereNull('used_at')
    .where('expires_at', '>', now.toSQL()!)
    .first()
  if (!exchange) {
    throw githubOAuthErrors.invalidExchange
  }

  const consumed = await db
    .from('github_login_exchanges')
    .where('id', exchange.id)
    .whereNull('used_at')
    .update({ used_at: now.toSQL() })
    .returning('id')
  if (consumed.length !== 1) {
    throw githubOAuthErrors.invalidExchange
  }

  const user = await User.find(exchange.userId)
  if (!user || user.disabledAt) {
    throw githubOAuthErrors.accountNotLinked
  }
  return user
}
