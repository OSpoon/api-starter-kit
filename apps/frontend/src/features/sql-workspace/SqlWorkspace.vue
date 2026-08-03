<script setup lang="ts">
import PageShell from '@/components/common/PageShell.vue'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import SqlWorkspaceDialogs from '@/features/sql-workspace/components/SqlWorkspaceDialogs.vue'
import SqlWorkspaceEditor from '@/features/sql-workspace/components/SqlWorkspaceEditor.vue'
import SqlWorkspaceExplorer from '@/features/sql-workspace/components/SqlWorkspaceExplorer.vue'
import { useSqlWorkspace } from '@/features/sql-workspace/composables/useSqlWorkspace'
import { useSqlWorkspaceTheme } from '@/features/sql-workspace/composables/useSqlWorkspaceTheme'
import { useSqlWorkspaceValidator } from '@/features/sql-workspace/composables/useSqlWorkspaceValidator'

type SaveIntent = 'file' | 'workspace'
const EXPLORER_MIN_SIZE = 16

const { t } = useI18n()
const {
  activeDialect,
  closeWorkspace,
  dialect,
  explorerCollapsed,
  files,
  importDirectory,
  importRemoteSource,
  importSqlSource,
  loading,
  restoreWorkspace,
  restoring,
  selectedFile,
  selectedFileDirty,
  selectedPath,
  selectFile,
  saveSelectedFile,
  saveWorkspace,
  tree,
  updateSelectedFile,
  uploadError,
} = useSqlWorkspace()
const { onEditorChange, onEditorMount } = useSqlWorkspaceValidator(
  selectedFile,
  activeDialect,
  updateSelectedFile
)
const { monacoTheme } = useSqlWorkspaceTheme()
const explorerResizing = ref(false)
const replaceDialogOpen = ref(false)
const pendingPickerId = ref<string>()
const remoteUrl = ref('')
const remoteUrlDialogOpen = ref(false)
const closeDialogOpen = ref(false)
const saveDialogOpen = ref(false)
const pendingSaveIntent = ref<SaveIntent>('file')

const editorOptions = {
  automaticLayout: true,
  minimap: { enabled: true },
  scrollBeyondLastLine: false,
  fontSize: 14,
  tabSize: 2,
  wordWrap: 'on' as const,
}

function toggleExplorer() {
  explorerCollapsed.value = !explorerCollapsed.value
}

function openPicker(id: string) {
  document.getElementById(id)?.click()
}

function requestOpenPicker(id: string) {
  if (!files.value.length) {
    openPicker(id)
    return
  }
  pendingPickerId.value = id
  replaceDialogOpen.value = true
}

function requestOpenUrl() {
  if (!files.value.length) {
    remoteUrlDialogOpen.value = true
    return
  }
  pendingPickerId.value = 'sql-workspace-remote-url'
  replaceDialogOpen.value = true
}

function confirmReplaceWorkspace() {
  const pickerId = pendingPickerId.value
  pendingPickerId.value = undefined
  replaceDialogOpen.value = false
  if (pickerId === 'sql-workspace-remote-url') remoteUrlDialogOpen.value = true
  else if (pickerId) void nextTick(() => openPicker(pickerId))
}

async function submitRemoteUrl() {
  if (!remoteUrl.value.trim()) return
  remoteUrlDialogOpen.value = false
  await importRemoteSource(remoteUrl.value.trim())
}

function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (!files.value.length) return
  event.preventDefault()
  event.returnValue = ''
}

function requestSave(intent: SaveIntent) {
  pendingSaveIntent.value = intent
  saveDialogOpen.value = true
}

async function confirmSave() {
  saveDialogOpen.value = false
  if (pendingSaveIntent.value === 'file') saveSelectedFile()
  else await saveWorkspace()
}

function saveShortcut(event: KeyboardEvent) {
  if (
    loading.value ||
    !selectedFile.value ||
    event.altKey ||
    (!event.ctrlKey && !event.metaKey) ||
    event.key.toLowerCase() !== 's'
  )
    return
  event.preventDefault()
  void saveSelectedFile()
}

onMounted(() => {
  window.addEventListener('beforeunload', warnBeforeUnload)
  window.addEventListener('keydown', saveShortcut)
  void restoreWorkspace()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeUnload)
  window.removeEventListener('keydown', saveShortcut)
})
</script>

<template>
  <PageShell
    :title="t('sql_workspace.title')"
    class="sql-workspace min-h-0 gap-0 overflow-hidden p-4"
    header-class="sql-workspace-header rounded-t-md border border-b-0 px-3 py-2 [&_h1]:font-sans [&_h1]:text-sm [&_h1]:font-medium [&_h1]:tracking-normal"
  >
    <input
      id="sql-workspace-script"
      class="sr-only"
      type="file"
      accept=".sql,text/sql"
      :disabled="loading"
      @change="importSqlSource"
    />
    <input
      id="sql-workspace-archive"
      class="sr-only"
      type="file"
      accept=".zip,application/zip"
      :disabled="loading"
      @change="importSqlSource"
    />
    <input
      id="sql-workspace-directory"
      class="sr-only"
      type="file"
      webkitdirectory
      multiple
      accept=".sql,text/sql"
      :disabled="loading"
      @change="importDirectory"
    />
    <p
      v-if="uploadError"
      class="sql-workspace-error shrink-0 border-x px-3 py-2 text-sm"
      role="alert"
    >
      {{ uploadError }}
    </p>
    <div class="min-h-0 flex-1 overflow-auto">
      <ResizablePanelGroup
        direction="horizontal"
        class="sql-workspace-frame h-full min-h-128 min-w-176 overflow-hidden rounded-b-md border"
        :class="explorerResizing && 'sql-workspace-resizing'"
      >
        <ResizablePanel
          :default-size="24"
          :min-size="EXPLORER_MIN_SIZE"
          :max-size="48"
          :class="explorerCollapsed && 'sql-workspace-explorer-collapsed'"
        >
          <SqlWorkspaceExplorer
            :files-count="files.length"
            :loading="loading || restoring"
            :nodes="tree"
            :selected-path="selectedPath"
            @collapse="toggleExplorer"
            @close-workspace="closeDialogOpen = true"
            @open-picker="requestOpenPicker"
            @open-url="requestOpenUrl"
            @save-workspace="requestSave('workspace')"
            @select="selectFile"
          />
        </ResizablePanel>
        <ResizableHandle
          :class="explorerCollapsed && 'pointer-events-none w-0! opacity-0'"
          @dragging="explorerResizing = $event"
        />
        <ResizablePanel :min-size="40">
          <SqlWorkspaceEditor
            class="h-full"
            :active-dialect="activeDialect"
            :dialect="dialect"
            :explorer-collapsed="explorerCollapsed"
            :loading="loading || restoring"
            :monaco-theme="monacoTheme"
            :options="editorOptions"
            :selected-file="selectedFile"
            :selected-file-dirty="selectedFileDirty"
            @change="onEditorChange"
            @mount="onEditorMount"
            @open-picker="requestOpenPicker"
            @open-url="requestOpenUrl"
            @save="saveSelectedFile"
            @toggle-explorer="toggleExplorer"
            @update:dialect="dialect = $event"
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
    <SqlWorkspaceDialogs
      v-model:close-open="closeDialogOpen"
      v-model:remote-url="remoteUrl"
      v-model:remote-url-open="remoteUrlDialogOpen"
      v-model:replace-open="replaceDialogOpen"
      v-model:save-open="saveDialogOpen"
      :loading="loading"
      @close="closeWorkspace"
      @replace="confirmReplaceWorkspace"
      @save="confirmSave"
      @submit-url="submitRemoteUrl"
    />
  </PageShell>
</template>

<style>
.sql-workspace {
  --sql-workspace-canvas: #faf8f5;
  --sql-workspace-sidebar: var(--card);
  --sql-workspace-toolbar: var(--card);
  --sql-workspace-border: var(--border);
  --sql-workspace-text: var(--foreground);
  --sql-workspace-muted: var(--muted-foreground);
  --sql-workspace-hover: var(--sidebar-accent);
  --sql-workspace-selection: var(--sidebar-accent);
  --sql-workspace-accent: var(--accent);
  --sql-workspace-error-bg: color-mix(in oklab, var(--destructive) 10%, var(--card));
  --sql-workspace-error: var(--destructive);
}

.dark .sql-workspace {
  --sql-workspace-canvas: #1f1f1d;
}

.sql-workspace-header,
.sql-workspace-toolbar,
.sql-workspace-explorer {
  border-color: var(--sql-workspace-border);
  background: var(--sql-workspace-toolbar);
  color: var(--sql-workspace-text);
}

.sql-workspace-frame {
  border-color: var(--sql-workspace-border);
  background: var(--sql-workspace-canvas);
  color: var(--sql-workspace-text);
}

.sql-workspace-explorer-collapsed {
  flex-grow: 0 !important;
}

.sql-workspace-explorer {
  transition: opacity 100ms ease-out;
}

.sql-workspace-explorer-collapsed .sql-workspace-explorer {
  pointer-events: none;
  opacity: 0;
}

.sql-workspace-frame [data-slot='resizable-panel'] {
  transition: flex-grow 220ms cubic-bezier(0.2, 0, 0, 1);
}

.sql-workspace-frame [data-slot='resizable-handle'] {
  transition:
    width 180ms ease-out,
    opacity 120ms ease-out;
}

.sql-workspace-frame.sql-workspace-resizing [data-slot='resizable-panel'] {
  transition: none;
}

.sql-workspace-explorer {
  background: var(--sql-workspace-sidebar);
}
.sql-workspace-error {
  border-color: var(--sql-workspace-border);
  background: var(--sql-workspace-error-bg);
  color: var(--sql-workspace-error);
}
.sql-workspace-icon-button {
  color: var(--sql-workspace-text);
}
.sql-workspace-icon-button:hover {
  background: var(--sql-workspace-hover);
}
.sql-workspace-open-button {
  background: var(--sql-workspace-hover);
  color: var(--sql-workspace-text);
}
.sql-workspace-open-button:hover {
  filter: brightness(0.96);
}
.sql-workspace-tab {
  border-color: var(--sql-workspace-accent);
  color: var(--sql-workspace-text);
}
.sql-workspace-dialect-label,
.sql-workspace-empty,
.sql-workspace-muted {
  color: var(--sql-workspace-muted);
}
.sql-workspace-select {
  border-color: var(--sql-workspace-border);
  background: var(--sql-workspace-canvas);
  color: var(--sql-workspace-text);
}
.sql-workspace-select:focus {
  border-color: var(--sql-workspace-accent);
}
</style>
