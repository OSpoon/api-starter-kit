<script setup lang="ts">
import { FilePenLine, Plus, RefreshCw } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { h } from 'vue'
import { toast } from 'vue-sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import DataTable from '@/components/common/DataTable.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import AgentMcpDialog from '@/features/agent-config/AgentMcpDialog.vue'
import AgentMcpToolsDialog from '@/features/agent-config/AgentMcpToolsDialog.vue'
import {
  type AgentMcpConfigurationDocument,
  type AgentMcpServer,
  type AgentMcpTool,
  discoverAgentMcpTools,
  getAgentMcpConfiguration,
  listAgentMcpServers,
  saveAgentMcpConfiguration,
  updateAgentMcpServer,
} from '@/features/agent-config/api'
import { usePermission } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

type McpRuntimeStatus = 'checking' | 'healthy' | 'failed'
type McpRuntime = {
  status: McpRuntimeStatus
  toolCount: number
  tools: AgentMcpTool[]
  error?: string
}

const { t } = useI18n()
const auth = useAuthStore()
const { can } = usePermission()
const items = ref<AgentMcpServer[]>([])
const runtime = ref<Record<string, McpRuntime>>({})
const page = ref(1)
const pageCount = ref(1)
const loading = ref(false)
const saving = ref(false)
const updatingEnabledId = ref<string | null>(null)
const configurationOpen = ref(false)
const toolsOpen = ref(false)
const currentConfiguration = ref<AgentMcpConfigurationDocument>({ mcpServers: {} })
const pendingConfiguration = ref<AgentMcpConfigurationDocument | null>(null)
const selectedServer = ref<AgentMcpServer | null>(null)
const selectedRuntime = computed(() =>
  selectedServer.value ? runtime.value[selectedServer.value.id] : undefined
)
const removeOpen = ref(false)
const pendingRemovalNames = ref<string[]>([])

async function checkServer(server: AgentMcpServer) {
  runtime.value[server.id] = { status: 'checking', toolCount: 0, tools: [] }
  try {
    const result = await discoverAgentMcpTools(auth.token, server.id)
    runtime.value[server.id] = {
      status: 'healthy',
      toolCount: result.tools.length,
      tools: result.tools,
    }
  } catch (error) {
    runtime.value[server.id] = {
      status: 'failed',
      toolCount: 0,
      tools: [],
      error: error instanceof Error ? error.message : t('agent_config.mcp_health_check_failed'),
    }
  }
}

async function load(nextPage = page.value) {
  loading.value = true
  try {
    const result = await listAgentMcpServers(auth.token, nextPage)
    items.value = result.items
    page.value = result.meta.currentPage
    pageCount.value = result.meta.lastPage
    if (can('agent-config:update')) {
      for (const server of result.items) await checkServer(server)
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.mcp_load_failed'))
  } finally {
    loading.value = false
  }
}

async function openConfiguration() {
  try {
    currentConfiguration.value = await getAgentMcpConfiguration(auth.token)
    configurationOpen.value = true
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.mcp_load_failed'))
  }
}

function saveConfiguration(next: AgentMcpConfigurationDocument) {
  const removedNames = Object.keys(currentConfiguration.value.mcpServers).filter(
    (name) => !(name in next.mcpServers)
  )
  if (removedNames.length) {
    pendingRemovalNames.value = removedNames
    pendingConfiguration.value = next
    removeOpen.value = true
    return
  }
  void persistConfiguration(next)
}

async function persistConfiguration(configuration: AgentMcpConfigurationDocument) {
  saving.value = true
  try {
    await saveAgentMcpConfiguration(auth.token, configuration)
    currentConfiguration.value = configuration
    pendingConfiguration.value = null
    removeOpen.value = false
    configurationOpen.value = false
    await load(1)
    toast.success(t('agent_config.mcp_saved'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.mcp_save_failed'))
  } finally {
    saving.value = false
  }
}

async function confirmConfigurationRemoval() {
  if (pendingConfiguration.value) await persistConfiguration(pendingConfiguration.value)
}

async function toggleServer(server: AgentMcpServer, enabled: boolean) {
  updatingEnabledId.value = server.id
  try {
    const updated = await updateAgentMcpServer(auth.token, server.id, { enabled })
    updateServer(updated)
    toast.success(t('agent_config.enabled_updated'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.mcp_save_failed'))
  } finally {
    updatingEnabledId.value = null
  }
}

function updateServer(server: AgentMcpServer) {
  items.value = items.value.map((item) => (item.id === server.id ? server : item))
  if (selectedServer.value?.id === server.id) selectedServer.value = server
}

function openTools(server: AgentMcpServer) {
  selectedServer.value = server
  toolsOpen.value = true
}

const columns = computed<ColumnDef<AgentMcpServer>[]>(() => [
  {
    accessorKey: 'name',
    meta: { label: t('agent_config.mcp_name') },
    header: () => t('agent_config.mcp_name'),
    cell: ({ row }) =>
      h(
        'div',
        { class: 'max-w-48 truncate font-medium', title: row.original.name },
        row.original.name
      ),
  },
  {
    accessorKey: 'command',
    meta: { label: t('agent_config.mcp_command') },
    header: () => t('agent_config.mcp_command'),
    cell: ({ row }) => {
      const command = [row.original.command, ...row.original.args].join(' ')
      return h(
        'div',
        { class: 'max-w-72 truncate font-mono text-xs text-muted-foreground', title: command },
        command
      )
    },
  },
  {
    id: 'health',
    meta: { label: t('agent_config.mcp_health') },
    header: () => t('agent_config.mcp_health'),
    cell: ({ row }) => {
      const state = runtime.value[row.original.id]
      const status = state?.status ?? 'unchecked'
      const label =
        status === 'healthy'
          ? 'mcp_health_healthy'
          : status === 'failed'
            ? 'mcp_health_failed'
            : status === 'checking'
              ? 'mcp_health_checking'
              : 'mcp_health_unchecked'
      return h(
        Badge,
        {
          variant: 'outline',
          title: state?.error,
          class:
            status === 'healthy'
              ? 'border-emerald-600/30 text-emerald-700 dark:text-emerald-400'
              : status === 'failed'
                ? 'border-destructive/30 text-destructive'
                : undefined,
        },
        () => t(`agent_config.${label}`)
      )
    },
  },
  {
    id: 'tools',
    meta: { label: t('agent_config.mcp_tools') },
    header: () => t('agent_config.mcp_tools'),
    cell: ({ row }) =>
      runtime.value[row.original.id]?.status === 'healthy'
        ? runtime.value[row.original.id]!.toolCount
        : Object.keys(row.original.enabledTools).length,
  },
  {
    id: 'enabled',
    meta: { label: t('agent_config.enabled') },
    header: () => t('agent_config.enabled'),
    cell: ({ row }) =>
      h(Badge, { variant: 'outline' }, () =>
        t(row.original.enabled ? 'common.enabled' : 'common.disabled')
      ),
  },
  {
    id: 'actions',
    enableHiding: false,
    meta: { label: t('common.actions') },
    header: () => h('div', { class: 'text-right' }, t('common.actions')),
    cell: ({ row }) =>
      h('div', { class: 'flex items-center justify-end gap-2' }, [
        h(Switch, {
          modelValue: row.original.enabled,
          'aria-label': t('agent_config.toggle_enabled', { name: row.original.name }),
          title: t('agent_config.toggle_enabled', { name: row.original.name }),
          disabled: !can('agent-config:update') || loading.value || saving.value,
          'onUpdate:modelValue': (enabled: boolean) => void toggleServer(row.original, enabled),
        }),
        h(
          Button,
          {
            variant: 'ghost',
            size: 'icon',
            title: t('agent_config.mcp_edit_tools'),
            'aria-label': t('agent_config.mcp_edit_tools'),
            disabled: !can('agent-config:update') || loading.value || saving.value,
            onClick: () => openTools(row.original),
          },
          () => h(FilePenLine, { class: 'size-4' })
        ),
      ]),
  },
])

const removalDescription = computed(() =>
  t('agent_config.mcp_remove_servers_description', { names: pendingRemovalNames.value.join('、') })
)

onMounted(() => void load())
</script>

<template>
  <Card class="flex min-h-0 flex-1 flex-col">
    <CardHeader class="flex flex-row items-start justify-between gap-4">
      <div class="min-w-0 space-y-1.5">
        <CardTitle>{{ t('agent_config.mcp_title') }}</CardTitle>
        <CardDescription>{{ t('agent_config.mcp_description') }}</CardDescription>
      </div>
      <div class="flex shrink-0 gap-2">
        <Button
          variant="outline"
          size="sm"
          :disabled="loading"
          :aria-label="t('agent_config.mcp_refresh_status')"
          :title="t('agent_config.mcp_refresh_status')"
          @click="load()"
        >
          <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
        </Button>
        <Button
          size="sm"
          :disabled="!can('agent-config:update') || saving"
          @click="openConfiguration"
        >
          <Plus class="size-4" />{{ t('agent_config.mcp_configuration_title') }}
        </Button>
      </div>
    </CardHeader>
    <CardContent class="flex min-h-0 flex-1 flex-col pb-6">
      <DataTable
        :columns="columns"
        :data="items"
        :show-search="false"
        :show-view="false"
        :empty-message="loading ? t('common.loading') : t('agent_config.mcp_empty')"
        :server-pagination="{ page, pageCount }"
        @page-change="load"
      />
    </CardContent>
  </Card>
  <AgentMcpDialog
    v-model:open="configurationOpen"
    :configuration="currentConfiguration"
    :saving="saving"
    @save="saveConfiguration"
  />
  <AgentMcpToolsDialog
    v-model:open="toolsOpen"
    :server="selectedServer"
    :tools="selectedRuntime?.tools ?? []"
    :error="selectedRuntime?.error"
    @server-updated="updateServer"
  />
  <ConfirmDialog
    v-model:open="removeOpen"
    :title="t('agent_config.mcp_remove_servers_title')"
    :description="removalDescription"
    :loading="saving"
    @confirm="confirmConfigurationRemoval"
  />
</template>
