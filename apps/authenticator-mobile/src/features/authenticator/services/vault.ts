import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

import type { AccountSortMode } from './account-order'
import type { TotpAccount } from './totp'
import { isTotpAccount } from './totp'

const STORAGE_KEY = 'accounts'
const SORT_MODE_KEY = 'sort-mode'
const STORAGE_PREFIX = 'project-authenticator-v1'
let previewAccounts: TotpAccount[] = []
let previewSortMode: AccountSortMode = 'manual'
let storageReady: Promise<void> | undefined

function initializeNativeStorage(): Promise<void> {
  storageReady ??= (async () => {
    await SecureStorage.setKeyPrefix(STORAGE_PREFIX)
    await SecureStorage.setSynchronize(false)
  })()
  return storageReady
}

export async function loadAccounts(): Promise<TotpAccount[]> {
  if (!Capacitor.isNativePlatform()) return structuredClone(previewAccounts)

  await initializeNativeStorage()
  const raw = await SecureStorage.getItem(STORAGE_KEY)
  if (!raw) return []

  const accounts: unknown = JSON.parse(raw)
  if (!Array.isArray(accounts) || !accounts.every(isTotpAccount))
    throw new Error('invalid account vault')
  return accounts
}

export async function saveAccounts(accounts: TotpAccount[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    previewAccounts = structuredClone(accounts)
    return
  }

  await initializeNativeStorage()
  if (accounts.length === 0) {
    await SecureStorage.remove(STORAGE_KEY)
    return
  }

  await SecureStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
}

export async function loadSortMode(): Promise<AccountSortMode> {
  if (!Capacitor.isNativePlatform()) return previewSortMode

  await initializeNativeStorage()
  const value = await SecureStorage.getItem(SORT_MODE_KEY)
  return value === 'ascending' || value === 'descending' ? value : 'manual'
}

export async function saveSortMode(mode: AccountSortMode): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    previewSortMode = mode
    return
  }

  await initializeNativeStorage()
  await SecureStorage.setItem(SORT_MODE_KEY, mode)
}
