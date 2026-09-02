import { useTimeoutFn } from '@vueuse/core'
import type { editor } from 'monaco-editor'
import * as monaco from 'monaco-editor'
import type { ComputedRef } from 'vue'

import type { SqlDialect, ValidationError, WorkspaceFile } from '@/features/sql-workspace/types'

type WorkerConstructor = new () => Worker

const validatorWorkerLoaders: Record<SqlDialect, () => Promise<{ default: WorkerConstructor }>> = {
  GenericSQL: () => import('@/workers/sql-workspace-validator-generic?worker'),
  MySQL: () => import('@/workers/sql-workspace-validator-mysql?worker'),
  PostgreSQL: () => import('@/workers/sql-workspace-validator-postgresql?worker'),
}

export function useSqlWorkspaceValidator(
  selectedFile: ComputedRef<WorkspaceFile | undefined>,
  activeDialect: ComputedRef<SqlDialect>,
  updateSelectedFile: (content: string) => void
) {
  const { t } = useI18n()
  const diagnostics = ref<editor.IMarkerData[]>([])
  let editorInstance: editor.IStandaloneCodeEditor | undefined
  let validatorWorker: Worker | undefined
  let validatorDialect: SqlDialect | undefined
  let pendingWorker: Promise<Worker> | undefined
  let pendingWorkerDialect: SqlDialect | undefined
  let validationId = 0

  function applyDiagnostics() {
    const model = editorInstance?.getModel()
    if (model) monaco.editor.setModelMarkers(model, 'sql-static-syntax', diagnostics.value)
  }

  function handleWorkerMessage({ data }: MessageEvent<{ id: number; errors: ValidationError[] }>) {
    if (data.id !== validationId) return
    diagnostics.value = data.errors.map((error) => ({
      severity: monaco.MarkerSeverity.Error,
      message: error.message ?? t('sql_workspace.errors.invalid_sql'),
      startLineNumber: error.startLine ?? 1,
      startColumn: (error.startCol ?? 0) + 1,
      endLineNumber: error.endLine ?? error.startLine ?? 1,
      endColumn: (error.endCol ?? error.startCol ?? 0) + 1,
    }))
    applyDiagnostics()
  }

  async function getValidatorWorker(requestedDialect: SqlDialect) {
    if (validatorWorker && validatorDialect === requestedDialect) return validatorWorker
    if (pendingWorker) {
      if (pendingWorkerDialect === requestedDialect) return pendingWorker
      await pendingWorker
      return getValidatorWorker(requestedDialect)
    }
    validatorWorker?.terminate()
    validatorWorker = undefined
    validatorDialect = undefined
    pendingWorkerDialect = requestedDialect
    pendingWorker = validatorWorkerLoaders[requestedDialect]().then(
      ({ default: ValidatorWorker }) => {
        const worker = new ValidatorWorker()
        worker.onmessage = handleWorkerMessage
        validatorWorker = worker
        validatorDialect = requestedDialect
        return worker
      }
    )
    try {
      return await pendingWorker
    } finally {
      pendingWorker = undefined
      pendingWorkerDialect = undefined
    }
  }

  async function validateInWorker(id: number, sql: string, requestedDialect: SqlDialect) {
    const worker = await getValidatorWorker(requestedDialect)
    if (id !== validationId || requestedDialect !== activeDialect.value) return
    worker.postMessage({ id, sql })
  }

  let scheduledValidation: { id: number; sql: string } | undefined
  const validationTimeout = useTimeoutFn(() => {
    if (!scheduledValidation) return
    const { id, sql } = scheduledValidation
    if (!sql.trim()) {
      diagnostics.value = []
      applyDiagnostics()
      return
    }
    void validateInWorker(id, sql, activeDialect.value)
  }, 250, { immediate: false })

  function validateSql(sql: string) {
    validationId += 1
    const id = validationId
    scheduledValidation = { id, sql }
    validationTimeout.stop()
    validationTimeout.start()
  }

  function onEditorMount(instance: editor.IStandaloneCodeEditor) {
    editorInstance = instance
    validateSql(instance.getValue())
  }

  function onEditorChange(value?: string) {
    if (!selectedFile.value) return
    updateSelectedFile(value ?? '')
    validateSql(value ?? '')
  }

  watch(activeDialect, () => selectedFile.value && validateSql(selectedFile.value.content))
  watch(
    () => selectedFile.value?.path,
    () => {
      if (selectedFile.value) void nextTick(() => validateSql(selectedFile.value!.content))
    }
  )
  onBeforeUnmount(() => {
    validationTimeout.stop()
    scheduledValidation = undefined
    validatorWorker?.terminate()
  })

  return { diagnostics, onEditorChange, onEditorMount, validateSql }
}
