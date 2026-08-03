import 'monaco-editor/nls/lang/zh-cn'
import 'monaco-editor/languages/definitions/sql/register'

import { loader } from '@guolao/vue-monaco-editor'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'

export type SqlWorkspaceMonacoTheme = 'sql-workspace-light' | 'sql-workspace-dark'

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker: () => Worker }
  }
}

let configured = false

export function useSqlWorkspaceTheme() {
  const monacoTheme = ref<SqlWorkspaceMonacoTheme>('sql-workspace-light')
  let observer: MutationObserver | undefined

  function sync() {
    monacoTheme.value = document.documentElement.classList.contains('dark')
      ? 'sql-workspace-dark'
      : 'sql-workspace-light'
    monaco.editor.setTheme(monacoTheme.value)
  }

  onMounted(() => {
    if (!configured) {
      window.MonacoEnvironment ??= { getWorker: () => new editorWorker() }
      loader.config({ monaco })
      monaco.editor.defineTheme('sql-workspace-light', {
        base: 'vs',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#faf8f5',
          'editorGutter.background': '#faf8f5',
          'editor.lineHighlightBackground': '#f3f0eb',
          'minimap.background': '#faf8f5',
        },
      })
      monaco.editor.defineTheme('sql-workspace-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#1f1f1d',
          'editorGutter.background': '#1f1f1d',
          'editor.lineHighlightBackground': '#282825',
          'minimap.background': '#1f1f1d',
        },
      })
      configured = true
    }
    sync()
    observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  })
  onBeforeUnmount(() => observer?.disconnect())

  return { monacoTheme }
}
