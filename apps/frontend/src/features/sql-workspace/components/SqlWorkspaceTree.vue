<script setup lang="ts">
import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen } from '@lucide/vue'

import type { TreeNode, WorkspaceFile } from '@/features/sql-workspace/types'

defineProps<{ nodes: TreeNode[]; selectedPath: string }>()
const emit = defineEmits<{ select: [file: WorkspaceFile] }>()
const expandedPaths = ref(new Set<string>())

function toggle(node: TreeNode) {
  const next = new Set(expandedPaths.value)
  if (next.has(node.path)) next.delete(node.path)
  else next.add(node.path)
  expandedPaths.value = next
}
</script>

<template>
  <ul class="sql-workspace-tree space-y-0.5 px-1">
    <li v-for="node in nodes" :key="node.path">
      <button
        v-if="node.directory"
        class="sql-workspace-tree-row flex w-full min-w-0 items-center gap-1 rounded p-1 text-left text-sm"
        :aria-label="node.name"
        :title="node.name"
        @click="toggle(node)"
      >
        <ChevronDown v-if="expandedPaths.has(node.path)" class="size-3 shrink-0" /><ChevronRight
          v-else
          class="size-3 shrink-0"
        /><FolderOpen
          v-if="expandedPaths.has(node.path)"
          class="sql-workspace-tree-icon size-4 shrink-0"
        /><Folder v-else class="sql-workspace-tree-icon size-4 shrink-0" /><span class="min-w-0 flex-1 truncate whitespace-nowrap">{{
          node.name
        }}</span>
      </button>
      <button
        v-else
        class="sql-workspace-tree-row flex w-full min-w-0 items-center gap-2 rounded px-2 py-1 text-left text-sm"
        :class="selectedPath === node.path && 'sql-workspace-tree-row-selected'"
        :aria-current="selectedPath === node.path ? 'page' : undefined"
        :title="node.name"
        @click="node.file && emit('select', node.file)"
      >
        <FileCode2 class="sql-workspace-tree-icon size-4 shrink-0" /><span class="min-w-0 flex-1 truncate whitespace-nowrap">{{
          node.name
        }}</span>
      </button>
      <SqlWorkspaceTree
        v-if="node.directory && expandedPaths.has(node.path)"
        class="sql-workspace-tree-children ml-4 border-l pl-2"
        :nodes="node.children"
        :selected-path="selectedPath"
        @select="emit('select', $event)"
      />
    </li>
  </ul>
</template>

<style scoped>
.sql-workspace-tree {
  color: var(--sql-workspace-text);
}
.sql-workspace-tree-row:hover {
  background: var(--sql-workspace-hover);
}
.sql-workspace-tree-row-selected {
  background: var(--sql-workspace-selection);
}
.sql-workspace-tree-icon {
  color: var(--sql-workspace-muted);
}
.sql-workspace-tree-children {
  border-color: var(--sql-workspace-border);
}
</style>
