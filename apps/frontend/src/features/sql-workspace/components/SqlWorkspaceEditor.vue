<script setup lang="ts">
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import { Download, FolderOpen, PanelLeftOpen } from '@lucide/vue'
import type { editor } from 'monaco-editor'

import { DIALECT_OPTIONS } from '@/features/sql-workspace/composables/useSqlWorkspace'
import type { DialectSelection, SqlDialect, WorkspaceFile } from '@/features/sql-workspace/types'

import SqlWorkspaceOpenMenu from './SqlWorkspaceOpenMenu.vue'

const props = defineProps<{
  activeDialect: SqlDialect
  dialect: DialectSelection
  explorerCollapsed: boolean
  loading: boolean
  monacoTheme: string
  options: editor.IStandaloneEditorConstructionOptions
  selectedFile?: WorkspaceFile
  selectedFileDirty: boolean
  diagnostics: editor.IMarkerData[]
  cursorLine: number
  cursorColumn: number
}>()
const emit = defineEmits<{
  (event: 'change', value?: string): void
  (event: 'format'): void
  (event: 'update:dialect', value: DialectSelection): void
  (event: 'mount', instance: editor.IStandaloneCodeEditor): void
  (event: 'cursor', line: number, column: number): void
  (event: 'reveal', line: number, column: number): void
  (event: 'openPicker', id: string): void
  (event: 'openUrl'): void
  (event: 'save'): void
  (event: 'toggleExplorer'): void
}>()
const { t } = useI18n()
const showProblems = ref(false)
let editorInstance: editor.IStandaloneCodeEditor | undefined
const dialectModel = computed({
  get: () => props.dialect,
  set: (value: DialectSelection) => emit('update:dialect', value),
})

function handleMount(instance: editor.IStandaloneCodeEditor) {
  editorInstance = instance
  instance.addAction({
    id: 'sql-workspace.format-document',
    label: t('sql_workspace.format'),
    contextMenuGroupId: '1_modification',
    contextMenuOrder: 1,
    run: () => emit('format'),
  })
  instance.onDidChangeCursorPosition(({ position }) =>
    emit('cursor', position.lineNumber, position.column)
  )
  emit('mount', instance)
}

function revealPosition(line: number, column: number) {
  editorInstance?.revealPositionInCenter({ lineNumber: line, column })
  editorInstance?.setPosition({ lineNumber: line, column })
  editorInstance?.focus()
}

defineExpose({ revealPosition })
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-col">
    <div
      v-if="selectedFile"
      class="sql-workspace-toolbar flex h-9 shrink-0 items-center justify-between gap-3 border-b pl-2"
    >
      <button
        v-if="explorerCollapsed"
        type="button"
        class="sql-workspace-icon-button inline-flex size-6 shrink-0 items-center justify-center rounded"
        :title="t('sql_workspace.expand_explorer')"
        :aria-label="t('sql_workspace.expand_explorer')"
        @click="emit('toggleExplorer')"
      >
        <PanelLeftOpen class="size-4" />
      </button>
      <span class="sql-workspace-tab self-stretch truncate border-t-2 px-1 pt-2 font-mono text-xs">
        <span
          v-if="selectedFileDirty"
          class="mr-1 inline-block size-2 rounded-full bg-amber-500"
          :title="t('sql_workspace.unsaved_changes')"
          :aria-label="t('sql_workspace.unsaved_changes')"
        />{{ selectedFile.path }}
      </span>
      <div class="mr-2 flex shrink-0 items-center gap-3">
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="sql-workspace-icon-button inline-flex size-6 items-center justify-center rounded"
            :title="t('sql_workspace.save_file')"
            :aria-label="t('sql_workspace.save_file')"
            @click="emit('save')"
          >
            <Download class="size-4" />
          </button>
        </div>
        <label class="sql-workspace-dialect-label flex items-center gap-2 text-xs"
          ><span>{{ t('sql_workspace.dialect') }}</span
          ><select
            v-model="dialectModel"
            class="sql-workspace-select h-7 rounded border px-2 text-xs outline-none"
          >
            <option v-for="item in DIALECT_OPTIONS" :key="item" :value="item">
              {{ item === 'auto' ? `${t('sql_workspace.dialect_auto')} (${activeDialect})` : item }}
            </option>
          </select></label
        >
      </div>
    </div>
    <div v-if="selectedFile" class="min-h-0 flex-1">
      <VueMonacoEditor
        :value="selectedFile.content"
        language="sql"
        :path="`sql-workspace://${selectedFile.path}`"
        height="100%"
        :theme="monacoTheme"
        :options="options"
        @mount="handleMount"
        @change="emit('change', $event)"
      />
    </div>
    <div
      v-if="selectedFile"
      class="sql-workspace-statusbar flex h-6 shrink-0 items-center justify-between px-2 text-[11px]"
    >
      <span>{{ activeDialect }} · {{ (selectedFile.content.length / 1024).toFixed(1) }} KB</span>
      <span class="flex items-center gap-3"
        ><button
          v-if="diagnostics.length"
          type="button"
          class="text-destructive"
          @click="showProblems = !showProblems"
        >
          {{ diagnostics.length }} {{ t('sql_workspace.problems') }}</button
        ><span>{{
          t('sql_workspace.line_column', { line: cursorLine, column: cursorColumn })
        }}</span></span
      >
    </div>
    <Transition name="sql-problems">
      <div
        v-if="showProblems && diagnostics.length"
        class="max-h-32 shrink-0 overflow-auto border-t px-2 py-1 text-xs"
      >
        <button
          v-for="(problem, index) in diagnostics"
          :key="index"
          type="button"
          class="block w-full truncate p-1 text-left hover:bg-muted"
          @click="revealPosition(problem.startLineNumber, problem.startColumn)"
        >
          {{
            t('sql_workspace.line_column', {
              line: problem.startLineNumber,
              column: problem.startColumn,
            })
          }}
          · {{ problem.message }}
        </button>
      </div>
    </Transition>
    <div
      v-if="!selectedFile"
      class="sql-workspace-empty flex flex-1 flex-col items-center justify-center gap-3 p-8 text-sm"
    >
      <FolderOpen class="sql-workspace-muted size-8" />
      <p>{{ t('sql_workspace.empty') }}</p>
      <SqlWorkspaceOpenMenu
        prominent
        :loading="loading"
        @open-picker="emit('openPicker', $event)"
        @open-url="emit('openUrl')"
      />
    </div>
  </section>
</template>

<style scoped>
.sql-problems-enter-active,
.sql-problems-leave-active {
  transition:
    max-height 220ms cubic-bezier(0.2, 0, 0, 1),
    opacity 100ms ease-out;
}
.sql-problems-enter-from,
.sql-problems-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
