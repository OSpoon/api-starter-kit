import JSZip from 'jszip'

import {
  clearStoredSqlWorkspace,
  loadStoredSqlWorkspace,
  saveStoredSqlWorkspace,
} from '@/features/sql-workspace/browser-storage'
import type {
  DialectSelection,
  SqlDialect,
  TreeNode,
  WorkspaceFile,
} from '@/features/sql-workspace/types'

const MAX_ARCHIVE_SIZE = 50 * 1024 * 1024
const MAX_UNCOMPRESSED_SIZE = 64 * 1024 * 1024
const MAX_FILES = 100
const DIALECT_SAMPLE_SIZE = 256 * 1024

export const DIALECT_OPTIONS: DialectSelection[] = ['auto', 'PostgreSQL', 'MySQL']

function isSafePath(path: string) {
  return (
    path && !path.startsWith('/') && !path.split('/').some((part) => part === '..' || part === '')
  )
}

function isSqlFile(path: string) {
  return path.toLocaleLowerCase().endsWith('.sql')
}

function workspaceFile(path: string, content: string): WorkspaceFile {
  return { path, content, savedContent: content }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function dialectSample(sql: string) {
  if (sql.length <= DIALECT_SAMPLE_SIZE * 2) return sql
  return `${sql.slice(0, DIALECT_SAMPLE_SIZE)}\n${sql.slice(-DIALECT_SAMPLE_SIZE)}`
}

function stripCommentsAndStrings(sql: string) {
  let sanitized = ''
  let index = 0
  let state:
    | 'block-comment'
    | 'dollar-quote'
    | 'double-quote'
    | 'line-comment'
    | 'single-quote'
    | undefined
  let dollarQuoteDelimiter: string | undefined
  while (index < sql.length) {
    const current = sql[index]
    const next = sql[index + 1]
    if (state === 'line-comment') {
      if (current === '\n') {
        state = undefined
        sanitized += current
      } else sanitized += ' '
      index += 1
      continue
    }
    if (state === 'block-comment') {
      if (current === '*' && next === '/') {
        state = undefined
        sanitized += '  '
        index += 2
      } else {
        sanitized += current === '\n' ? '\n' : ' '
        index += 1
      }
      continue
    }
    if (state === 'dollar-quote' && dollarQuoteDelimiter) {
      if (sql.startsWith(dollarQuoteDelimiter, index)) {
        sanitized += dollarQuoteDelimiter
        index += dollarQuoteDelimiter.length
        dollarQuoteDelimiter = undefined
        state = undefined
      } else {
        sanitized += current === '\n' ? '\n' : ' '
        index += 1
      }
      continue
    }
    if (state === 'single-quote' || state === 'double-quote') {
      const terminator = state === 'single-quote' ? "'" : '"'
      if (current === terminator && next === current) {
        sanitized += '  '
        index += 2
      } else if (current === terminator) {
        state = undefined
        sanitized += ' '
        index += 1
      } else {
        sanitized += current === '\n' ? '\n' : ' '
        index += 1
      }
      continue
    }
    if (current === '-' && next === '-') {
      state = 'line-comment'
      sanitized += '  '
      index += 2
    } else if (current === '/' && next === '*') {
      state = 'block-comment'
      sanitized += '  '
      index += 2
    } else if (current === "'") {
      state = 'single-quote'
      sanitized += ' '
      index += 1
    } else if (current === '"') {
      state = 'double-quote'
      sanitized += ' '
      index += 1
    } else if (current === '$') {
      const delimiter = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]
      if (delimiter) {
        state = 'dollar-quote'
        dollarQuoteDelimiter = delimiter
        sanitized += delimiter
        index += delimiter.length
      } else {
        sanitized += current
        index += 1
      }
    } else {
      sanitized += current
      index += 1
    }
  }
  return sanitized
}

function signatureScore(sql: string, signatures: Array<[RegExp, number]>) {
  return signatures.reduce(
    (score, [signature, weight]) => score + (signature.test(sql) ? weight : 0),
    0
  )
}

function detectDialect(sql: string): SqlDialect {
  const normalized = stripCommentsAndStrings(dialectSample(sql)).toUpperCase()
  const mysqlScore = signatureScore(normalized, [
    [/\bAUTO_INCREMENT\b/, 6],
    [/\bON\s+DUPLICATE\s+KEY\b/, 6],
    [/\bENGINE\s*=\s*\w+\b/, 5],
    [/\bSQL_CALC_FOUND_ROWS\b/, 5],
    [/\bDELIMITER\s+\S+/, 4],
    [/\bUNSIGNED\b/, 2],
    [/`[^`]+`/, 1],
  ])
  const postgresqlScore = signatureScore(normalized, [
    [/\bBIGSERIAL\b|\bSMALLSERIAL\b|\bSERIAL\b/, 6],
    [/\bILIKE\b/, 6],
    [/\bJSONB\b/, 5],
    [/\bON\s+CONFLICT\b/, 5],
    [/\bGENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/, 5],
    [/::\s*[A-Z_][A-Z0-9_]*/, 4],
    [/\$[A-Z_][A-Z0-9_]*\$|\$\$/, 3],
    [/\bRETURNING\b/, 1],
  ])

  if (mysqlScore >= 3 && mysqlScore > postgresqlScore) return 'MySQL'
  if (postgresqlScore >= 3 && postgresqlScore > mysqlScore) return 'PostgreSQL'
  return 'GenericSQL'
}

function buildTree(workspaceFiles: WorkspaceFile[]) {
  const root: TreeNode[] = []
  for (const file of workspaceFiles) {
    const parts = file.path.split('/')
    let level = root
    let currentPath = ''
    for (const [index, part] of parts.entries()) {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const directory = index < parts.length - 1
      let node = level.find((candidate) => candidate.name === part)
      if (!node) {
        node = { name: part, path: currentPath, directory, children: [] }
        level.push(node)
      }
      if (!directory) node.file = file
      level = node.children
    }
  }
  const sortNodes = (nodes: TreeNode[]) =>
    nodes.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name))
  const sortRecursively = (nodes: TreeNode[]) =>
    nodes.forEach((node) => {
      sortNodes(node.children)
      sortRecursively(node.children)
    })
  sortNodes(root)
  sortRecursively(root)
  return root
}

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
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let persistenceRevision = 0

  function workspaceSnapshot() {
    return {
      dialect: dialect.value,
      explorerCollapsed: explorerCollapsed.value,
      files: files.value,
      selectedPath: selectedPath.value,
      version: 1 as const,
    }
  }

  function beginWorkspacePersistence() {
    persistenceRevision += 1
    pendingWorkspacePersistence.value = Boolean(files.value.length)
    return persistenceRevision
  }

  async function persistWorkspace(revision: number) {
    if (!files.value.length) return
    let persisted = false
    try {
      await saveStoredSqlWorkspace(workspaceSnapshot())
      persisted = true
    } catch {
      uploadError.value = t('sql_workspace.errors.storage_unavailable')
    } finally {
      if (persisted && revision === persistenceRevision) pendingWorkspacePersistence.value = false
    }
  }

  function scheduleWorkspacePersistence() {
    if (!files.value.length) return
    const revision = beginWorkspacePersistence()
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => void persistWorkspace(revision), 600)
  }

  async function persistWorkspaceNow() {
    clearTimeout(persistTimer)
    await persistWorkspace(beginWorkspacePersistence())
  }

  async function restoreWorkspace() {
    if (files.value.length) return
    restoring.value = true
    try {
      const workspace = await loadStoredSqlWorkspace()
      if (!workspace || workspace.version !== 1 || !workspace.files.length) return
      files.value = workspace.files
      selectedPath.value = workspace.files.some((file) => file.path === workspace.selectedPath)
        ? workspace.selectedPath
        : workspace.files[0]!.path
      dialect.value = workspace.dialect
      explorerCollapsed.value = workspace.explorerCollapsed
      dirtyPaths.value = new Set(
        workspace.files
          .filter((file) => file.content !== file.savedContent)
          .map((file) => file.path)
      )
    } catch {
      uploadError.value = t('sql_workspace.errors.storage_unavailable')
    } finally {
      restoring.value = false
    }
  }

  async function importSource(source: File) {
    uploadError.value = ''
    if (source.size > MAX_ARCHIVE_SIZE) {
      uploadError.value = t('sql_workspace.errors.archive_too_large')
      return
    }
    loading.value = true
    try {
      if (isSqlFile(source.name)) {
        files.value = [workspaceFile(source.name, await source.text())]
        dirtyPaths.value = new Set()
        selectedPath.value = source.name
        explorerCollapsed.value = false
        scheduleWorkspacePersistence()
        return
      }
      const zip = await JSZip.loadAsync(source)
      const entries = Object.values(zip.files).filter(
        (entry) => !entry.dir && isSafePath(entry.name) && isSqlFile(entry.name)
      )
      const uncompressedSize = entries.reduce(
        (size, entry) =>
          size +
          Number(
            (entry as unknown as { _data?: { uncompressedSize?: number } })._data
              ?.uncompressedSize ?? 0
          ),
        0
      )
      if (entries.length > MAX_FILES) throw new Error('too_many_files')
      if (uncompressedSize > MAX_UNCOMPRESSED_SIZE) throw new Error('too_large')
      const unpacked = await Promise.all(
        entries.map(async (entry) => workspaceFile(entry.name, await entry.async('text')))
      )
      files.value = unpacked
      dirtyPaths.value = new Set()
      selectedPath.value = unpacked[0]?.path ?? ''
      if (unpacked.length) explorerCollapsed.value = false
      else uploadError.value = t('sql_workspace.errors.no_files')
      if (unpacked.length) scheduleWorkspacePersistence()
    } catch (error) {
      uploadError.value = t(
        `sql_workspace.errors.${error instanceof Error && error.message === 'too_many_files' ? 'too_many_files' : error instanceof Error && error.message === 'too_large' ? 'archive_too_large' : 'invalid_archive'}`
      )
    } finally {
      loading.value = false
    }
  }

  async function importSqlSource(event: Event) {
    const input = event.target as HTMLInputElement
    const source = input.files?.[0]
    if (!source) return
    await importSource(source)
    input.value = ''
  }

  async function importRemoteSource(url: string) {
    try {
      const parsedUrl = new URL(url)
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('unsupported')
      loading.value = true
      const response = await fetch(parsedUrl)
      if (!response.ok) throw new Error('unavailable')
      const contentType = response.headers.get('content-type') ?? ''
      const filename = decodeURIComponent(parsedUrl.pathname.split('/').at(-1) || 'remote.sql')
      const zipResponse = /zip|compressed/i.test(contentType)
      if (!isSqlFile(filename) && !zipResponse) throw new Error('unsupported')
      const source = new File(
        [await response.blob()],
        zipResponse && !isSqlFile(filename) ? 'remote.zip' : filename,
        { type: contentType }
      )
      loading.value = false
      await importSource(source)
    } catch (error) {
      loading.value = false
      uploadError.value = t(
        `sql_workspace.errors.${error instanceof Error && error.message === 'unsupported' ? 'remote_unsupported' : 'remote_unavailable'}`
      )
    }
  }

  async function importDirectory(event: Event) {
    const input = event.target as HTMLInputElement
    const directoryFiles = Array.from(input.files ?? []).filter((file) =>
      isSqlFile(file.webkitRelativePath || file.name)
    )
    uploadError.value = ''
    if (!directoryFiles.length) {
      uploadError.value = t('sql_workspace.errors.no_files')
      return
    }
    if (directoryFiles.length > MAX_FILES) {
      uploadError.value = t('sql_workspace.errors.too_many_files')
      return
    }
    if (directoryFiles.reduce((size, file) => size + file.size, 0) > MAX_UNCOMPRESSED_SIZE) {
      uploadError.value = t('sql_workspace.errors.archive_too_large')
      return
    }
    loading.value = true
    try {
      const importedFiles = await Promise.all(
        directoryFiles.map(async (file) => ({
          path: file.webkitRelativePath || file.name,
          content: await file.text(),
        }))
      )
      files.value = importedFiles.map((file) => workspaceFile(file.path, file.content))
      dirtyPaths.value = new Set()
      selectedPath.value = importedFiles[0]?.path ?? ''
      explorerCollapsed.value = false
      scheduleWorkspacePersistence()
    } finally {
      loading.value = false
      input.value = ''
    }
  }

  function selectFile(file: WorkspaceFile) {
    selectedPath.value = file.path
    scheduleWorkspacePersistence()
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
      scheduleWorkspacePersistence()
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
    await persistWorkspaceNow()
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
    scheduleWorkspacePersistence()
  }

  async function closeWorkspace() {
    clearTimeout(persistTimer)
    persistenceRevision += 1
    pendingWorkspacePersistence.value = false
    files.value = []
    dirtyPaths.value = new Set()
    selectedPath.value = ''
    dialect.value = 'auto'
    explorerCollapsed.value = true
    uploadError.value = ''
    try {
      await clearStoredSqlWorkspace()
    } catch {
      uploadError.value = t('sql_workspace.errors.storage_unavailable')
    }
  }

  watch([dialect, explorerCollapsed], scheduleWorkspacePersistence)
  onBeforeUnmount(() => clearTimeout(persistTimer))

  return {
    activeDialect,
    closeWorkspace,
    dialect,
    explorerCollapsed,
    files,
    importDirectory,
    importRemoteSource,
    importSqlSource,
    loading,
    pendingWorkspacePersistence,
    restoring,
    restoreWorkspace,
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
