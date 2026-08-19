import JSZip from 'jszip'

import { useSqlWorkspaceImport } from '@/features/sql-workspace/composables/useSqlWorkspaceImport'
import { useSqlWorkspacePersistence } from '@/features/sql-workspace/composables/useSqlWorkspacePersistence'
import {
  buildTree,
  detectDialect,
  downloadBlob,
} from '@/features/sql-workspace/sql-workspace-utils'
import type { DialectSelection, SqlDialect, WorkspaceFile } from '@/features/sql-workspace/types'

export { DIALECT_OPTIONS } from '@/features/sql-workspace/sql-workspace-utils'

export function useSqlWorkspace() {
  const { t } = useI18n()
  const files = shallowRef<WorkspaceFile[]>([])
  const dirtyPaths = ref(new Set<string>())
  const selectedPath = ref('')
  const dialect = ref<DialectSelection>('auto')
  const explorerCollapsed = ref(true)
  const loading = ref(false)
  const pendingWorkspacePersistence = ref(false)
  const restoring = ref(false)
  const uploadError = ref('')
  const selectedFile = computed(() => files.value.find((file) => file.path === selectedPath.value))
  const selectedFileDirty = computed(() =>
    Boolean(selectedFile.value && dirtyPaths.value.has(selectedFile.value.path))
  )
  const tree = computed(() => buildTree(files.value))
  const activeDialect = computed<SqlDialect>(() =>
    dialect.value === 'auto' ? detectDialect(selectedFile.value?.content ?? '') : dialect.value
  )
  const persistence = useSqlWorkspacePersistence((key) => t(key), {
    files,
    dirtyPaths,
    selectedPath,
    dialect,
    explorerCollapsed,
    pending: pendingWorkspacePersistence,
    restoring,
    error: uploadError,
  })
  const importer = useSqlWorkspaceImport(
    (key) => t(key),
    {
      files,
      dirtyPaths,
      selectedPath,
      explorerCollapsed,
      loading,
      error: uploadError,
    },
    persistence.schedule
  )

  function selectFile(file: WorkspaceFile) {
    selectedPath.value = file.path
    persistence.schedule()
  }

  function updateSelectedFile(content: string) {
    if (selectedFile.value) {
      selectedFile.value.content = content
      const nextDirtyPaths = new Set(dirtyPaths.value)
      if (content === selectedFile.value.savedContent)
        nextDirtyPaths.delete(selectedFile.value.path)
      else nextDirtyPaths.add(selectedFile.value.path)
      dirtyPaths.value = nextDirtyPaths
      triggerRef(files)
      persistence.schedule()
    }
  }

  async function saveSelectedFile() {
    const file = selectedFile.value
    if (!file) return
    file.savedContent = file.content
    const nextDirtyPaths = new Set(dirtyPaths.value)
    nextDirtyPaths.delete(file.path)
    dirtyPaths.value = nextDirtyPaths
    triggerRef(files)
    await persistence.persistNow()
  }

  async function saveWorkspace() {
    if (!files.value.length) return
    const archive = new JSZip()
    files.value.forEach((file) => archive.file(file.path, file.content))
    downloadBlob(await archive.generateAsync({ type: 'blob' }), 'sql-workspace.zip')
    files.value.forEach((file) => {
      file.savedContent = file.content
    })
    dirtyPaths.value = new Set()
    triggerRef(files)
    persistence.schedule()
  }

  async function closeWorkspace() {
    files.value = []
    dirtyPaths.value = new Set()
    selectedPath.value = ''
    dialect.value = 'auto'
    explorerCollapsed.value = true
    uploadError.value = ''
    await persistence.clear()
  }

  return {
    activeDialect,
    closeWorkspace,
    dialect,
    explorerCollapsed,
    files,
    importDirectory: importer.importDirectory,
    importRemoteSource: importer.importRemoteSource,
    importSqlSource: importer.importSqlSource,
    loading,
    pendingWorkspacePersistence,
    restoring,
    restoreWorkspace: persistence.restore,
    selectedFile,
    selectedFileDirty,
    selectedPath,
    selectFile,
    saveSelectedFile,
    saveWorkspace,
    tree,
    updateSelectedFile,
    uploadError,
  }
}
