const BUILD_API_BASE_URL = import.meta.env.VITE_API_URL ?? ''
let runtimeApiBaseUrl: string | null = null
let runtimeEmbedAuth: { apiKey: string; sessionId: string } | null = null
const aiChatPath = '/api/v1/ai-chat'
const embedAiChatPath = '/api/v1/embed/ai-chat'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function setRuntimeApiBaseUrl(baseUrl: string | null) {
  runtimeApiBaseUrl = baseUrl
}

export function setRuntimeEmbedAuth(auth: { apiKey: string; sessionId: string } | null) {
  runtimeEmbedAuth = auth
}

export function hasRuntimeEmbedAuth() {
  return runtimeEmbedAuth !== null
}

function matchesPath(path: string, prefix: string) {
  const pathname = path.split('?', 1)[0] ?? path
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function isAiChatPath(path: string) {
  return matchesPath(path, aiChatPath) || matchesPath(path, embedAiChatPath)
}

export function apiRequestHeaders(path: string, headers?: HeadersInit) {
  const result = new Headers(headers)
  if (runtimeEmbedAuth && isAiChatPath(path)) {
    result.set('X-API-Key', runtimeEmbedAuth.apiKey)
    result.set('X-Embed-Session', runtimeEmbedAuth.sessionId)
  }
  return result
}

export function apiRequestCredentials(path: string, credentials?: RequestCredentials) {
  return runtimeEmbedAuth && isAiChatPath(path) ? 'omit' : (credentials ?? 'include')
}

export function apiUrl(path: string) {
  const baseUrl = runtimeApiBaseUrl ?? BUILD_API_BASE_URL
  let normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (runtimeEmbedAuth && matchesPath(normalizedPath, aiChatPath)) {
    normalizedPath = normalizedPath.replace(aiChatPath, embedAiChatPath)
  }

  return `${baseUrl}${normalizedPath}`
}

interface RequestOptions extends RequestInit {
  token?: string | null
}

interface ErrorPayload {
  message?: string
  errors?: Array<{ message?: string }>
}

function getErrorMessage(payload: unknown, fallback: string) {
  const error = payload as ErrorPayload
  return error?.errors?.[0]?.message ?? error?.message ?? fallback
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  const headers = apiRequestHeaders(path, options.headers)
  headers.set('Accept', 'application/json')

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`)
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: apiRequestCredentials(path, options.credentials),
    headers,
  })

  const payload = response.status === 204 ? null : await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(getErrorMessage(payload, 'Request failed'), response.status)
  }

  return payload as T
}
