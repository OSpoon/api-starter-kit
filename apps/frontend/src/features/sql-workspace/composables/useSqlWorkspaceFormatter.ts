import type { Ref } from 'vue'

import type { SqlDialect, WorkspaceFile } from '@/features/sql-workspace/types'

const MAX_FORMAT_SIZE = 10 * 1024 * 1024

export function useSqlWorkspaceFormatter(
  selectedFile: Ref<WorkspaceFile | undefined>,
  activeDialect: Ref<SqlDialect>,
  updateSelectedFile: (content: string) => void
) {
  const formatting = ref(false)
  const formatError = ref('')

  async function formatSelectedFile() {
    const file = selectedFile.value
    if (!file || formatting.value) return
    if (file.content.length > MAX_FORMAT_SIZE) {
      formatError.value = 'sql_workspace.errors.format_too_large'
      return
    }
    formatting.value = true
    formatError.value = ''
    const FormatterWorker = (await import('@/workers/sql-workspace-formatter?worker')).default
    const worker = new FormatterWorker()
    worker.postMessage({ dialect: activeDialect.value, sql: file.content })
    await new Promise<void>((resolve) => {
      worker.onmessage = ({ data }: MessageEvent<{ error?: string; sql?: string }>) => {
        if (data.sql !== undefined) updateSelectedFile(data.sql)
        else formatError.value = data.error ?? 'sql_workspace.errors.format_failed'
        worker.terminate()
        resolve()
      }
    })
    formatting.value = false
  }

  return { formatError, formatSelectedFile, formatting }
}
