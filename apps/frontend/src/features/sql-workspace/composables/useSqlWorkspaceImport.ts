import JSZip from 'jszip'
import type { Ref, ShallowRef } from 'vue'

import type { WorkspaceFile } from '@/features/sql-workspace/types'

const MAX_ARCHIVE_SIZE = 50 * 1024 * 1024
const MAX_UNCOMPRESSED_SIZE = 64 * 1024 * 1024
const MAX_FILES = 100

type ImportState = {
  files: ShallowRef<WorkspaceFile[]>
  dirtyPaths: Ref<Set<string>>
  selectedPath: Ref<string>
  explorerCollapsed: Ref<boolean>
  loading: Ref<boolean>
  error: Ref<string>
}

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

export function useSqlWorkspaceImport(
  translate: (key: string) => string,
  state: ImportState,
  schedulePersistence: () => void
) {
  async function importSource(source: File) {
    state.error.value = ''
    if (source.size > MAX_ARCHIVE_SIZE) {
      state.error.value = translate('sql_workspace.errors.archive_too_large')
      return
    }
    state.loading.value = true
    try {
      if (isSqlFile(source.name)) {
        state.files.value = [workspaceFile(source.name, await source.text())]
        state.dirtyPaths.value = new Set()
        state.selectedPath.value = source.name
        state.explorerCollapsed.value = false
        schedulePersistence()
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
      state.files.value = unpacked
      state.dirtyPaths.value = new Set()
      state.selectedPath.value = unpacked[0]?.path ?? ''
      if (unpacked.length) state.explorerCollapsed.value = false
      else state.error.value = translate('sql_workspace.errors.no_files')
      if (unpacked.length) schedulePersistence()
    } catch (error) {
      state.error.value = translate(
        `sql_workspace.errors.${error instanceof Error && error.message === 'too_many_files' ? 'too_many_files' : error instanceof Error && error.message === 'too_large' ? 'archive_too_large' : 'invalid_archive'}`
      )
    } finally {
      state.loading.value = false
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
      state.loading.value = true
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
      state.loading.value = false
      await importSource(source)
    } catch (error) {
      state.loading.value = false
      state.error.value = translate(
        `sql_workspace.errors.${error instanceof Error && error.message === 'unsupported' ? 'remote_unsupported' : 'remote_unavailable'}`
      )
    }
  }

  async function importDirectory(event: Event) {
    const input = event.target as HTMLInputElement
    const directoryFiles = Array.from(input.files ?? []).filter((file) =>
      isSqlFile(file.webkitRelativePath || file.name)
    )
    state.error.value = ''
    if (!directoryFiles.length) {
      state.error.value = translate('sql_workspace.errors.no_files')
      return
    }
    if (directoryFiles.length > MAX_FILES) {
      state.error.value = translate('sql_workspace.errors.too_many_files')
      return
    }
    if (directoryFiles.reduce((size, file) => size + file.size, 0) > MAX_UNCOMPRESSED_SIZE) {
      state.error.value = translate('sql_workspace.errors.archive_too_large')
      return
    }
    state.loading.value = true
    try {
      const importedFiles = await Promise.all(
        directoryFiles.map(async (file) => ({
          path: file.webkitRelativePath || file.name,
          content: await file.text(),
        }))
      )
      state.files.value = importedFiles.map((file) => workspaceFile(file.path, file.content))
      state.dirtyPaths.value = new Set()
      state.selectedPath.value = importedFiles[0]?.path ?? ''
      state.explorerCollapsed.value = false
      schedulePersistence()
    } finally {
      state.loading.value = false
      input.value = ''
    }
  }

  return { importDirectory, importRemoteSource, importSource, importSqlSource }
}
