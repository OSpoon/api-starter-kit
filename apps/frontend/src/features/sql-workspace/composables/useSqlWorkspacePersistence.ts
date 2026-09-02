import { useTimeoutFn } from '@vueuse/core'
import { type Ref, type ShallowRef, watch } from 'vue'

import {
  clearStoredSqlWorkspace,
  loadStoredSqlWorkspace,
  saveStoredSqlWorkspace,
} from '@/features/sql-workspace/browser-storage'
import type { DialectSelection, WorkspaceFile } from '@/features/sql-workspace/types'

type PersistenceState = {
  files: ShallowRef<WorkspaceFile[]>
  dirtyPaths: Ref<Set<string>>
  selectedPath: Ref<string>
  dialect: Ref<DialectSelection>
  explorerCollapsed: Ref<boolean>
  pending: Ref<boolean>
  restoring: Ref<boolean>
  error: Ref<string>
}

export function useSqlWorkspacePersistence(
  translate: (key: string) => string,
  state: PersistenceState
) {
  let persistenceRevision = 0
  let scheduledRevision: number | undefined

  function workspaceSnapshot() {
    return {
      dialect: state.dialect.value,
      explorerCollapsed: state.explorerCollapsed.value,
      files: state.files.value,
      selectedPath: state.selectedPath.value,
      version: 1 as const,
    }
  }

  function beginPersistence() {
    persistenceRevision += 1
    state.pending.value = Boolean(state.files.value.length)
    return persistenceRevision
  }

  async function persist(revision: number) {
    if (!state.files.value.length) return
    let persisted = false
    try {
      await saveStoredSqlWorkspace(workspaceSnapshot())
      persisted = true
    } catch {
      state.error.value = translate('sql_workspace.errors.storage_unavailable')
    } finally {
      if (persisted && revision === persistenceRevision) state.pending.value = false
    }
  }

  const persistTimeout = useTimeoutFn(
    () => {
      if (scheduledRevision !== undefined) void persist(scheduledRevision)
    },
    600,
    { immediate: false }
  )

  function schedule() {
    if (!state.files.value.length) return
    scheduledRevision = beginPersistence()
    persistTimeout.stop()
    persistTimeout.start()
  }

  async function persistNow() {
    persistTimeout.stop()
    scheduledRevision = undefined
    await persist(beginPersistence())
  }

  async function restore() {
    if (state.files.value.length) return
    state.restoring.value = true
    try {
      const workspace = await loadStoredSqlWorkspace()
      if (!workspace || workspace.version !== 1 || !workspace.files.length) return
      state.files.value = workspace.files
      state.selectedPath.value = workspace.files.some(
        (file) => file.path === workspace.selectedPath
      )
        ? workspace.selectedPath
        : workspace.files[0]!.path
      state.dialect.value = workspace.dialect
      state.explorerCollapsed.value = workspace.explorerCollapsed
      state.dirtyPaths.value = new Set(
        workspace.files
          .filter((file) => file.content !== file.savedContent)
          .map((file) => file.path)
      )
    } catch {
      state.error.value = translate('sql_workspace.errors.storage_unavailable')
    } finally {
      state.restoring.value = false
    }
  }

  async function clear() {
    persistTimeout.stop()
    scheduledRevision = undefined
    persistenceRevision += 1
    state.pending.value = false
    try {
      await clearStoredSqlWorkspace()
    } catch {
      state.error.value = translate('sql_workspace.errors.storage_unavailable')
    }
  }

  watch([state.dialect, state.explorerCollapsed], schedule)

  return { clear, persistNow, restore, schedule }
}
