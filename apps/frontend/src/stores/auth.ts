import { defineStore } from 'pinia'

import {
  type ApiUser,
  changePassword as changePasswordRequest,
  exchangeGithubLogin as exchangeGithubLoginRequest,
  fetchProfile as fetchProfileRequest,
  login as loginRequest,
  type LoginResult,
  logout as logoutRequest,
  verify2fa as verify2faRequest,
} from '@/lib/account-api'

export type { ApiUser, LoginResult }

const tokenKey = 'api-starter-kit:auth-token'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(tokenKey))
  const user = ref<ApiUser | null>(null)
  const loading = ref(false)

  const isAuthenticated = computed(() => Boolean(token.value))

  function setSession(payload: { user: ApiUser; token: string }) {
    token.value = payload.token
    user.value = payload.user
    localStorage.setItem(tokenKey, payload.token)
  }

  function clearSession() {
    token.value = null
    user.value = null
    localStorage.removeItem(tokenKey)
  }

  async function login(payload: {
    email: string
    password: string
    turnstileToken?: string
  }): Promise<LoginResult> {
    loading.value = true
    try {
      const result = await loginRequest(payload.email, payload.password, payload.turnstileToken)
      if (result.kind === 'success') {
        setSession({ user: result.user, token: result.token })
      }
      return result
    } finally {
      loading.value = false
    }
  }

  async function verify2fa(tempToken: string, code: string) {
    loading.value = true
    try {
      const authData = await verify2faRequest(tempToken, code)
      setSession(authData)
      return authData
    } finally {
      loading.value = false
    }
  }

  async function exchangeGithubLogin(code: string) {
    loading.value = true
    try {
      const result = await exchangeGithubLoginRequest(code)
      if (result.kind === 'success') {
        setSession(result)
      }
      return result
    } finally {
      loading.value = false
    }
  }

  async function changePassword(currentPassword: string, password: string) {
    const profile = await changePasswordRequest(token.value, currentPassword, password)
    user.value = profile
    return profile
  }

  async function fetchProfile() {
    if (!token.value) {
      return null
    }

    const profile = await fetchProfileRequest(token.value)
    user.value = profile
    return profile
  }

  async function logout() {
    await logoutRequest(token.value)
    clearSession()
  }

  return {
    token,
    user,
    loading,
    isAuthenticated,
    login,
    exchangeGithubLogin,
    verify2fa,
    changePassword,
    fetchProfile,
    logout,
    clearSession,
  }
})
