<script setup lang="ts">
import { Archive, Ellipsis, FolderX, PanelLeftClose } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import type { TreeNode, WorkspaceFile } from '@/features/sql-workspace/types'

import SqlWorkspaceOpenMenu from './SqlWorkspaceOpenMenu.vue'
import SqlWorkspaceTree from './SqlWorkspaceTree.vue'

const props = defineProps<{
  filesCount: number
  loading: boolean
  nodes: TreeNode[]
  selectedPath: string
}>()
const emit = defineEmits<{
  collapse: []
  closeWorkspace: []
  openPicker: [id: string]
  openUrl: []
  saveWorkspace: []
  select: [file: WorkspaceFile]
}>()
const { t } = useI18n()
const filterQuery = ref('')
const filteredNodes = computed(() =>
  filterNodes(props.nodes, filterQuery.value.trim().toLocaleLowerCase())
)

function filterNodes(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes
  return nodes.flatMap((node) => {
    const children = filterNodes(node.children, query)
    if (node.name.toLocaleLowerCase().includes(query) || children.length)
      return [{ ...node, children }]
    return []
  })
}
</script>

<template>
  <aside
    class="sql-workspace-explorer flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r pb-2"
  >
    <div class="flex h-9 min-w-0 items-center justify-between overflow-hidden px-3">
      <p
        class="sql-workspace-muted min-w-0 flex-1 truncate text-xs font-medium tracking-wider whitespace-nowrap uppercase"
      >
        {{ t('sql_workspace.explorer') }}
      </p>
      <div class="flex shrink-0 items-center gap-1">
        <SqlWorkspaceOpenMenu
          v-if="filesCount"
          compact
          :loading="loading"
          @open-picker="emit('openPicker', $event)"
          @open-url="emit('openUrl')"
        />
        <DropdownMenu v-if="filesCount">
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              :disabled="loading"
              :title="t('sql_workspace.workspace_actions')"
              :aria-label="t('sql_workspace.workspace_actions')"
            >
              <Ellipsis class="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem :disabled="loading" @select="emit('saveWorkspace')">
              <Archive />{{ t('sql_workspace.save_workspace') }}
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="loading" @select="emit('closeWorkspace')">
              <FolderX />{{ t('sql_workspace.close_workspace') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          :title="t('sql_workspace.collapse_explorer')"
          :aria-label="t('sql_workspace.collapse_explorer')"
          @click="emit('collapse')"
        >
          <PanelLeftClose class="size-4" />
        </Button>
      </div>
    </div>
    <div v-if="filesCount" class="px-2 pb-2">
      <Input
        v-model="filterQuery"
        :placeholder="t('sql_workspace.filter_files')"
        class="h-7 text-xs"
      />
    </div>
    <div class="min-h-0 flex-1 overflow-auto">
      <SqlWorkspaceTree
        v-if="filteredNodes.length"
        :nodes="filteredNodes"
        :selected-path="selectedPath"
        @select="emit('select', $event)"
      />
      <p v-else-if="filterQuery" class="sql-workspace-muted px-3 text-xs">
        {{ t('sql_workspace.no_matching_files') }}
      </p>
    </div>
  </aside>
</template>
