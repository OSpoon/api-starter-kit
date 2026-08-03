import type { DialectSelection, WorkspaceFile } from './types'

const DATABASE_NAME = 'api-starter-kit:sql-workspace'
const DATABASE_VERSION = 1
const STORE_NAME = 'workspace'
const WORKSPACE_KEY = 'current'

export type StoredSqlWorkspace = {
  dialect: DialectSelection
  explorerCollapsed: boolean
  files: WorkspaceFile[]
  selectedPath: string
  version: 1
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
  })
}

export async function loadStoredSqlWorkspace() {
  const database = await openDatabase()
  try {
    return await new Promise<StoredSqlWorkspace | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(WORKSPACE_KEY)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result as StoredSqlWorkspace | undefined)
    })
  } finally {
    database.close()
  }
}

export async function saveStoredSqlWorkspace(workspace: StoredSqlWorkspace) {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(workspace, WORKSPACE_KEY)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } finally {
    database.close()
  }
}

export async function clearStoredSqlWorkspace() {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(WORKSPACE_KEY)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } finally {
    database.close()
  }
}
