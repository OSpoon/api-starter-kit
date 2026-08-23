import { apiRequest } from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import { readItem } from '@/lib/api-types'

export interface ApiUser {
  id: number
  fullName: string | null
  email: string
  createdAt: string
  updatedAt: string
  initials: string
  twoFactorEnabled?: boolean
  passwordChangedAt?: string | null
  roles: Array<{ id: number; code: string; name: string }>
  permissions: string[]
  githubLinked?: boolean
  channelIdentities?: Array<{
    channel: 'wecom' | 'feishu' | 'dingtalk'
    boundAt: string
  }>
}

interface AuthResponse {
  user: ApiUser
  token: string
  requiresPasswordChange?: boolean
}

interface LoginChallengeResponse {
  requiresTwoFactor: true
  tempToken: string
  requiresPasswordChange?: boolean
}

export type LoginResult =
  | { kind: 'success'; user: ApiUser; token: string; requiresPasswordChange?: boolean }
  | { kind: 'two_factor'; tempToken: string; requiresPasswordChange?: boolean }

function toLoginResult(data: AuthResponse | LoginChallengeResponse): LoginResult {
  if ('requiresTwoFactor' in data && data.requiresTwoFactor) {
    return {
      kind: 'two_factor',
      tempToken: data.tempToken,
      requiresPasswordChange: data.requiresPasswordChange,
    }
  }

  const authData = data as AuthResponse
  return {
    kind: 'success',
    user: authData.user,
    token: authData.token,
    requiresPasswordChange: authData.requiresPasswordChange,
  }
}

function authOptions(token: string | null) {
  return { token }
}

export async function login(
  email: string,
  password: string,
  turnstileToken?: string
): Promise<LoginResult> {
  const response = await apiRequest<ApiEnvelope<AuthResponse | LoginChallengeResponse>>(
    '/api/v1/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password, turnstileToken }),
    }
  )

  return toLoginResult(response.data)
}

export async function exchangeGithubLogin(code?: string): Promise<LoginResult> {
  const response = await apiRequest<ApiEnvelope<AuthResponse | LoginChallengeResponse>>(
    '/api/v1/auth/github/exchange',
    {
      method: 'POST',
      body: JSON.stringify(code ? { code } : {}),
    }
  )
  return toLoginResult(response.data)
}

export async function completeGithubLogin(
  code: string | undefined,
  email: string,
  password: string,
  turnstileToken?: string
): Promise<LoginResult> {
  const response = await apiRequest<ApiEnvelope<AuthResponse | LoginChallengeResponse>>(
    '/api/v1/auth/github/complete',
    {
      method: 'POST',
      body: JSON.stringify({ code, email, password, turnstileToken }),
    }
  )
  return toLoginResult(response.data)
}

export async function beginGithubLink(token: string | null) {
  const response = await apiRequest<ApiEnvelope<{ url: string }>>('/api/v1/account/github/link', {
    ...authOptions(token),
    method: 'POST',
  })
  return response.data.url
}

export async function unlinkGithub(token: string | null, password: string) {
  const response = await apiRequest<ApiEnvelope<ApiUser>>('/api/v1/account/github/unlink', {
    ...authOptions(token),
    method: 'POST',
    body: JSON.stringify({ password }),
  })
  return readItem(response)
}

export async function verify2fa(tempToken: string, code: string) {
  const response = await apiRequest<ApiEnvelope<AuthResponse>>('/api/v1/auth/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ tempToken, code }),
  })
  return response.data
}

export async function fetchProfile(token: string | null) {
  const response = await apiRequest<ApiEnvelope<ApiUser>>(
    '/api/v1/account/profile',
    authOptions(token)
  )
  return readItem(response)
}

export async function changePassword(
  token: string | null,
  currentPassword: string,
  password: string
) {
  const response = await apiRequest<ApiEnvelope<ApiUser>>('/api/v1/account/password', {
    ...authOptions(token),
    method: 'PUT',
    body: JSON.stringify({
      currentPassword,
      password,
      passwordConfirmation: password,
    }),
  })
  return readItem(response)
}

export async function logout(token: string | null) {
  if (!token) {
    return
  }

  await apiRequest('/api/v1/account/logout', {
    method: 'POST',
    token,
  }).catch(() => null)
}

export async function generate2fa(token: string | null) {
  const response = await apiRequest<ApiEnvelope<{ secret: string; qrCode: string }>>(
    '/api/v1/account/2fa/generate',
    {
      method: 'POST',
      ...authOptions(token),
    }
  )
  return readItem(response)
}

export async function enable2fa(token: string | null, secret: string, otp: string) {
  const response = await apiRequest<ApiEnvelope<{ user: ApiUser; recoveryCodes: string[] }>>(
    '/api/v1/account/2fa/enable',
    {
      method: 'POST',
      ...authOptions(token),
      body: JSON.stringify({ secret, token: otp }),
    }
  )
  return readItem(response)
}

export async function disable2fa(token: string | null, password: string) {
  const response = await apiRequest<ApiEnvelope<ApiUser>>('/api/v1/account/2fa/disable', {
    method: 'POST',
    ...authOptions(token),
    body: JSON.stringify({ password }),
  })
  return readItem(response)
}

export async function bindChannelIdentity(token: string | null, code: string) {
  const response = await apiRequest<
    ApiEnvelope<{
      bound: boolean
      channel: 'wecom' | 'feishu' | 'dingtalk'
      externalTenantId: string
      externalUserId: string
    }>
  >('/api/v1/account/channel-identities/bind', {
    ...authOptions(token),
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  return readItem(response)
}

export async function unbindWecomChannelIdentity(token: string | null, password: string) {
  const response = await apiRequest<ApiEnvelope<{ unbound: boolean; channel: 'wecom' }>>(
    '/api/v1/account/channel-identities/wecom/unbind',
    {
      ...authOptions(token),
      method: 'POST',
      body: JSON.stringify({ password }),
    }
  )
  return readItem(response)
}

export async function unbindFeishuChannelIdentity(token: string | null, password: string) {
  const response = await apiRequest<ApiEnvelope<{ unbound: boolean; channel: 'feishu' }>>(
    '/api/v1/account/channel-identities/feishu/unbind',
    {
      ...authOptions(token),
      method: 'POST',
      body: JSON.stringify({ password }),
    }
  )
  return readItem(response)
}

export async function unbindDingtalkChannelIdentity(token: string | null, password: string) {
  return readItem(
    await apiRequest<ApiEnvelope<{ unbound: boolean; channel: 'dingtalk' }>>(
      '/api/v1/account/channel-identities/dingtalk/unbind',
      { method: 'POST', token, body: JSON.stringify({ password }) }
    )
  )
}
