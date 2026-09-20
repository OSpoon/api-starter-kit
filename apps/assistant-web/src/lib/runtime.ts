import { setRuntimeApiBaseUrl } from '@/lib/api'

import { normalizeServerOrigin } from './server-url'

const serverUrlStorageKey = 'api-starter-kit:assistant-api-base-url:v1'
const buildApiBaseUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') || null

export interface AssistantExtensionPermissionBridge {
  requestHostPermission(origin: string): Promise<boolean>
  hasHostPermission(origin: string): Promise<boolean>
  removeHostPermission(origin: string): Promise<boolean>
}

let assistantExtensionPermissionBridge: AssistantExtensionPermissionBridge | null = null

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

export function isExtensionRuntime() {
  return typeof window !== 'undefined' && window.location.protocol === 'chrome-extension:'
}

export function isAssistantConnectionRuntime() {
  return isDesktopRuntime() || isExtensionRuntime()
}

export function registerAssistantExtensionPermissionBridge(
  bridge: AssistantExtensionPermissionBridge
) {
  assistantExtensionPermissionBridge = bridge
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

  if (import.meta.env.DEV && typeof window !== 'undefined' && !isExtensionRuntime()) {
    return window.location.origin
  }

  return null
}

export async function hasConfiguredAssistantServer() {
  const apiBaseUrl = getAssistantApiBaseUrl()
  if (!apiBaseUrl) return false
  if (!isExtensionRuntime()) return true

  return assistantExtensionPermissionBridge?.hasHostPermission(apiBaseUrl) ?? false
}

export function requestAssistantServerPermission(origin: string) {
  if (!isExtensionRuntime()) return Promise.resolve(true)

  return assistantExtensionPermissionBridge?.requestHostPermission(origin) ?? Promise.resolve(false)
}

export function removeAssistantServerPermission(origin: string) {
  if (!isExtensionRuntime()) return Promise.resolve(true)

  return assistantExtensionPermissionBridge?.removeHostPermission(origin) ?? Promise.resolve(false)
}

export function initializeAssistantRuntime() {
  if (isAssistantConnectionRuntime()) {
    setRuntimeApiBaseUrl(getAssistantApiBaseUrl())
  }
}

export function saveAssistantServerUrl(url: string) {
  window.localStorage.setItem(serverUrlStorageKey, url)
  setRuntimeApiBaseUrl(url)
}
