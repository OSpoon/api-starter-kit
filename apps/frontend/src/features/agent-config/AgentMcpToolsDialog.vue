<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import { h } from 'vue'
import { toast } from 'vue-sonner'

import DataTable from '@/components/common/DataTable.vue'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AgentMcpServer, AgentMcpTool } from '@/features/agent-config/api'
import { updateAgentMcpServer } from '@/features/agent-config/api'
import { usePermission } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  open: boolean
  server: AgentMcpServer | null
  tools: AgentMcpTool[]
  error?: string
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  'server-updated': [server: AgentMcpServer]
}>()
const { t } = useI18n()
const auth = useAuthStore()
const { can } = usePermission()
const updating = ref<string | null>(null)

async function setTool(tool: AgentMcpTool, enabled: boolean, mode?: 'read' | 'confirm') {
  if (!props.server) return
  updating.value = tool.name
  const enabledTools = { ...props.server.enabledTools }
  if (enabled) {
    enabledTools[tool.name] = {
      mode: mode ?? enabledTools[tool.name]?.mode ?? 'confirm',
    }
  } else {
    delete enabledTools[tool.name]
  }
  try {
    const server = await updateAgentMcpServer(auth.token, props.server.id, { enabledTools })
    emit('server-updated', server)
  } catch (reason) {
    toast.error(reason instanceof Error ? reason.message : t('agent_config.mcp_save_failed'))
  } finally {
    updating.value = null
  }
}

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
    id: 'enabled',
    meta: { label: t('agent_config.enabled') },
    header: () => t('agent_config.enabled'),
    cell: ({ row }) =>
      h(Checkbox, {
        modelValue: Boolean(props.server?.enabledTools[row.original.name]),
        disabled: !can('agent-config:update') || updating.value !== null,
        'aria-label': t('agent_config.mcp_enable_tool', { name: row.original.name }),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
          void setTool(row.original, value === true),
      }),
  },
  {
    id: 'mode',
    meta: { label: t('agent_config.mcp_execution_policy') },
    header: () => t('agent_config.mcp_execution_policy'),
    cell: ({ row }) => {
      const configuration = props.server?.enabledTools[row.original.name]
      if (!configuration) {
        return h('span', { class: 'text-muted-foreground' }, t('agent_config.mcp_tool_disabled'))
      }
      return h(
        Select,
        {
          modelValue: configuration.mode,
          disabled: !can('agent-config:update') || updating.value !== null,
          'aria-label': t('agent_config.mcp_execution_policy'),
          'onUpdate:modelValue': (value: unknown) =>
            void setTool(row.original, true, value as 'read' | 'confirm'),
        },
        () => [
          h(SelectTrigger, { class: 'w-48' }, () => h(SelectValue)),
          h(SelectContent, {}, () => [
            h(SelectItem, { value: 'read', disabled: !row.original.readOnlyHint }, () =>
              t('agent_config.mcp_mode_read')
            ),
            h(SelectItem, { value: 'confirm' }, () => t('agent_config.mcp_mode_confirm')),
          ]),
        ]
      )
    },
  },
])
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>{{ t('agent_config.mcp_tools') }} · {{ server?.name }}</DialogTitle>
        <DialogDescription>{{ t('agent_config.mcp_tools_description') }}</DialogDescription>
      </DialogHeader>
      <div class="min-w-0">
        <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
        <DataTable
          v-if="tools.length || !error"
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
