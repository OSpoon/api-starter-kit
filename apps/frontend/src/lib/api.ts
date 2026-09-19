const BUILD_API_BASE_URL = import.meta.env.VITE_API_URL ?? ''
let runtimeApiBaseUrl: string | null = null

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

export function apiUrl(path: string) {
  const baseUrl = runtimeApiBaseUrl ?? BUILD_API_BASE_URL
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

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
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`)
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: 'include',
    headers,
  })

  const payload = response.status === 204 ? null : await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(getErrorMessage(payload, 'Request failed'), response.status)
  }

  return payload as T
}
