import type { PaginationState, VisibilityState } from '@tanstack/vue-table'

type TablePreference = {
  columnVisibility?: VisibilityState
  pagination?: PaginationState
}

type BrowserPreferences = {
  version: 1
  locale?: string
  tables: Record<string, TablePreference>
}

const storageKey = 'api-starter-kit:preferences'
const legacyPreferenceKey = 'api-starter-kit:table-preferences'
const defaultPagination: PaginationState = { pageIndex: 0, pageSize: 10 }
const legacyTableKeys = [
  'api-keys-table',
  'rbac-users-table',
  'rbac-roles-table',
  'rbac-permissions-table',
  'rbac-permissions-tree',
  'audit-logs-table',
]

function parseStorageValue<T>(key: string): T | null {
  const value = localStorage.getItem(key)
  if (!value) return null

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function migrateLegacyPreferences(): BrowserPreferences {
  const existing = parseStorageValue<Partial<BrowserPreferences>>(legacyPreferenceKey)
  const tables = { ...existing?.tables }

  for (const key of legacyTableKeys) {
    const visibility = parseStorageValue<VisibilityState>(key)
    const pagination = parseStorageValue<PaginationState>(`${key}-pagination`)
    const activeKey = key === 'rbac-permissions-tree' ? 'rbac-permissions-table' : key

    if (visibility && Object.keys(visibility).length > 0) {
      tables[activeKey] = { ...tables[activeKey], columnVisibility: visibility }
    }
    if (pagination && (pagination.pageIndex !== 0 || pagination.pageSize !== 10)) {
      tables[activeKey] = { ...tables[activeKey], pagination }
    }

    localStorage.removeItem(key)
    localStorage.removeItem(`${key}-pagination`)
  }

  const locale = localStorage.getItem('locale') ?? existing?.locale
  localStorage.removeItem('locale')
  localStorage.removeItem(legacyPreferenceKey)

  return { version: 1, locale: locale ?? undefined, tables }
}

const preferences = useLocalStorage<BrowserPreferences>(storageKey, migrateLegacyPreferences(), {
  mergeDefaults: true,
})

function updateTablePreference(
  tableKey: string,
  update: (current: TablePreference) => TablePreference
) {
  const nextTables = { ...preferences.value.tables }
  const next = update(nextTables[tableKey] ?? {})
  const hasVisibility = Boolean(next.columnVisibility && Object.keys(next.columnVisibility).length)
  const hasPagination = Boolean(
    next.pagination &&
    (next.pagination.pageIndex !== defaultPagination.pageIndex ||
      next.pagination.pageSize !== defaultPagination.pageSize)
  )

  if (!hasVisibility && !hasPagination) {
    delete nextTables[tableKey]
  } else {
    nextTables[tableKey] = next
  }

  preferences.value = { ...preferences.value, version: 1, tables: nextTables }
}

export function getStoredLocale() {
  return preferences.value.locale ?? 'zh-CN'
}

export function setStoredLocale(locale: string) {
  preferences.value = { ...preferences.value, version: 1, locale }
}

export function useTablePreferences(tableKey: string) {
  const columnVisibility = computed<VisibilityState>({
    get: () => preferences.value.tables[tableKey]?.columnVisibility ?? {},
    set: (value) => {
      updateTablePreference(tableKey, (current) => ({ ...current, columnVisibility: value }))
    },
  })
  const pagination = computed<PaginationState>({
    get: () => preferences.value.tables[tableKey]?.pagination ?? defaultPagination,
    set: (value) => {
      updateTablePreference(tableKey, (current) => ({ ...current, pagination: value }))
    },
  })

  return { columnVisibility, pagination }
}
