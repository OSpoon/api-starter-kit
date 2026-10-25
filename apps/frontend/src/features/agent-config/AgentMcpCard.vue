<script setup lang="ts">
import { FilePenLine, Plus, RefreshCw, Trash2 } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { toast } from 'vue-sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import DataTable from '@/components/common/DataTable.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import AgentMcpDialog from '@/features/agent-config/AgentMcpDialog.vue'
import {
  type AgentMcpServer,
  deleteAgentMcpServer,
  listAgentMcpServers,
  saveAgentMcpServer,
} from '@/features/agent-config/api'
import { usePermission } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
const { can } = usePermission()
const items = ref<AgentMcpServer[]>([])
const page = ref(1)
const pageCount = ref(1)
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const updatingEnabledId = ref<number | null>(null)
const selected = ref<AgentMcpServer | null>(null)
const dialogOpen = ref(false)
const pendingDelete = ref<AgentMcpServer | null>(null)
const deleteOpen = ref(false)

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
    id: 'toolCount',
    meta: { label: t('agent_config.mcp_tools') },
    header: () => t('agent_config.mcp_tools'),
    cell: ({ row }) => Object.keys(row.original.enabledTools).length,
  },
  {
    id: 'status',
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
      h('div', { class: 'flex items-center justify-end gap-1' }, [
        h(Switch, {
          modelValue: row.original.enabled,
          'aria-label': t('agent_config.toggle_enabled', { name: row.original.name }),
          title: t('agent_config.toggle_enabled', { name: row.original.name }),
          disabled:
            !can('agent-config:update') ||
            loading.value ||
            saving.value ||
            deleting.value ||
            updatingEnabledId.value !== null,
          'onUpdate:modelValue': (enabled: boolean) => toggleEnabled(row.original, enabled),
        }),
        h(
          Button,
          {
            variant: 'ghost',
            size: 'icon',
            title: t('common.edit'),
            'aria-label': t('common.edit'),
            disabled:
              !can('agent-config:update') ||
              saving.value ||
              deleting.value ||
              updatingEnabledId.value !== null,
            onClick: () => openEdit(row.original),
          },
          () => h(FilePenLine, { class: 'size-4' })
        ),
        h(
          Button,
          {
            variant: 'ghost',
            size: 'icon',
            class: 'text-destructive',
            title: t('common.delete'),
            'aria-label': t('common.delete'),
            disabled:
              !can('agent-config:update') ||
              saving.value ||
              deleting.value ||
              updatingEnabledId.value !== null,
            onClick: () => requestDelete(row.original),
          },
          () => h(Trash2, { class: 'size-4' })
        ),
      ]),
  },
])

async function load(nextPage = page.value) {
  loading.value = true
  try {
    const result = await listAgentMcpServers(auth.token, nextPage)
    items.value = result.items
    page.value = result.meta.currentPage
    pageCount.value = result.meta.lastPage
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.mcp_load_failed'))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  selected.value = null
  dialogOpen.value = true
}

function openEdit(server: AgentMcpServer) {
  selected.value = server
  dialogOpen.value = true
}

function requestDelete(server: AgentMcpServer) {
  pendingDelete.value = server
  deleteOpen.value = true
}

async function save(payload: Omit<Parameters<typeof saveAgentMcpServer>[2], 'enabled'>) {
  saving.value = true
  try {
    await saveAgentMcpServer(auth.token, selected.value?.id ?? null, {
      ...payload,
      enabled: selected.value?.enabled ?? false,
    })
    dialogOpen.value = false
    await load()
    toast.success(t('agent_config.mcp_saved'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.mcp_save_failed'))
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(server: AgentMcpServer, enabled: boolean) {
  updatingEnabledId.value = server.id
  try {
    const updated = await saveAgentMcpServer(auth.token, server.id, {
      name: server.name,
      command: server.command,
      args: server.args,
      cwd: server.cwd,
      enabled,
      enabledTools: server.enabledTools,
    })
    items.value = items.value.map((item) => (item.id === server.id ? updated : item))
    toast.success(t('agent_config.enabled_updated'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.mcp_save_failed'))
  } finally {
    updatingEnabledId.value = null
  }
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  try {
    await deleteAgentMcpServer(auth.token, pendingDelete.value.id)
    deleteOpen.value = false
    pendingDelete.value = null
    await load(items.value.length <= 1 && page.value > 1 ? page.value - 1 : page.value)
    toast.success(t('agent_config.mcp_deleted'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.mcp_delete_failed'))
  } finally {
    deleting.value = false
  }
}

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
          :aria-label="t('common.refresh')"
          :title="t('common.refresh')"
          @click="load()"
        >
          <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
        </Button>
        <Button size="sm" :disabled="!can('agent-config:update')" @click="openCreate">
          <Plus class="size-4" />{{ t('agent_config.create_mcp') }}
        </Button>
      </div>
    </CardHeader>
    <CardContent class="flex min-h-0 flex-1 flex-col pb-6">
      <p v-if="loading && !items.length" class="py-8 text-center text-sm text-muted-foreground">
        {{ t('common.loading') }}
      </p>
      <DataTable
        v-else
        :columns="columns"
        :data="items"
        :show-search="false"
        :show-view="false"
        :empty-message="t('agent_config.mcp_empty')"
        :server-pagination="{ page, pageCount }"
        @page-change="load"
      />
    </CardContent>
  </Card>
  <AgentMcpDialog v-model:open="dialogOpen" :server="selected" :saving="saving" @save="save" />
  <ConfirmDialog
    v-model:open="deleteOpen"
    :title="t('agent_config.delete_mcp_title')"
    :description="t('agent_config.delete_mcp_description', { name: pendingDelete?.name ?? '' })"
    :loading="deleting"
    @confirm="confirmDelete"
  />
</template>
