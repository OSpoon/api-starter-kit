import { setRuntimeApiBaseUrl } from '@/lib/api'

import { normalizeServerOrigin } from './server-url'

const serverUrlStorageKey = 'api-starter-kit:assistant-api-base-url:v1'
const buildApiBaseUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') || null

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export function isDesktopRuntime() {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    '__TAURI_INTERNALS__' in window ||
    window.location.protocol === 'tauri:' ||
    window.location.hostname === 'tauri.localhost'
  )
}

export function getSavedAssistantServerUrl() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const saved = window.localStorage.getItem(serverUrlStorageKey)
    return saved ? normalizeServerOrigin(saved) : null
  } catch {
    return null
  }
}

export function getAssistantApiBaseUrl() {
  const saved = getSavedAssistantServerUrl()
  if (saved) {
    return saved
  }

  if (buildApiBaseUrl) {
    return buildApiBaseUrl
  }

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return window.location.origin
  }

  return null
}

export function hasConfiguredAssistantServer() {
  return Boolean(getAssistantApiBaseUrl() || import.meta.env.DEV)
}

export function initializeAssistantDesktopRuntime() {
  if (isDesktopRuntime()) {
    setRuntimeApiBaseUrl(getAssistantApiBaseUrl())
  }
}

export function saveAssistantServerUrl(url: string) {
  window.localStorage.setItem(serverUrlStorageKey, url)
  setRuntimeApiBaseUrl(url)
}
