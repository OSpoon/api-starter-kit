<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import { h } from 'vue'

import DataTable from '@/components/common/DataTable.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { AgentMcpServer, AgentMcpTool } from '@/features/agent-config/api'

defineProps<{
  open: boolean
  server: AgentMcpServer | null
  tools: AgentMcpTool[]
  error?: string
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
}>()
const { t } = useI18n()

const columns = computed<ColumnDef<AgentMcpTool>[]>(() => [
  {
    id: 'tool',
    meta: { label: t('agent_config.tool_name') },
    header: () => t('agent_config.tool_name'),
    cell: ({ row }) =>
      h('div', { class: 'min-w-0 space-y-1' }, [
        h('div', { class: 'break-all font-medium' }, row.original.name),
        h(
          'p',
          {
            class: 'line-clamp-2 whitespace-normal text-xs text-muted-foreground',
            title: row.original.description,
          },
          row.original.description
        ),
      ]),
  },
  {
    id: 'execution',
    meta: { label: t('agent_config.mcp_execution') },
    header: () => t('agent_config.mcp_execution'),
    cell: ({ row }) =>
      h(
        'span',
        { class: 'text-muted-foreground' },
        t(
          row.original.readOnlyHint
            ? 'agent_config.mcp_readonly_direct'
            : 'agent_config.mcp_confirm_before_execute'
        )
      ),
  },
])
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="flex max-h-[85vh] flex-col gap-0 overflow-hidden sm:max-w-5xl">
      <DialogHeader class="shrink-0">
        <DialogTitle>{{ t('agent_config.mcp_tools') }} · {{ server?.name }}</DialogTitle>
        <DialogDescription>{{ t('agent_config.mcp_tools_description') }}</DialogDescription>
      </DialogHeader>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <p v-if="error" class="shrink-0 text-sm text-destructive">{{ error }}</p>
        <DataTable
          v-if="tools.length || !error"
          class="min-h-0 flex-1"
          :columns="columns"
          :data="tools"
          :show-search="false"
          :show-view="false"
          :empty-message="t('agent_config.mcp_tools_empty')"
        />
      </div>
    </DialogContent>
  </Dialog>
</template>
