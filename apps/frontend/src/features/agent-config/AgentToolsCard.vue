<script setup lang="ts">
import { LoaderCircle, RefreshCw } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { toast } from 'vue-sonner'

import DataTable from '@/components/common/DataTable.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { type AgentToolSetting, getAgentTools, updateAgentTools } from '@/features/agent-config/api'
import { usePermission } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
const { can } = usePermission()
const loading = ref(true)
const saving = ref(false)
const tools = ref<AgentToolSetting[]>([])
const saved = ref('')
const canUpdate = computed(() => can('agent-config:update'))
const serialize = (items: AgentToolSetting[]) =>
  JSON.stringify(
    items
      .map(({ code, enabled, mode }) => ({ code, enabled, mode }))
      .sort((a, b) => a.code.localeCompare(b.code))
  )

const columns = computed<ColumnDef<AgentToolSetting>[]>(() => [
  {
    accessorKey: 'code',
    meta: { label: t('agent_config.tool_name') },
    header: () => t('agent_config.tool_name'),
    cell: ({ row }) =>
      h('div', { class: 'min-w-48' }, [
        h('div', { class: 'font-medium' }, t(`agent_config.tool_names.${row.original.code}`)),
        h('div', { class: 'text-xs text-muted-foreground' }, row.original.code),
        h(
          'div',
          { class: 'mt-1 max-w-xl text-xs text-muted-foreground' },
          t(`agent_config.tool_descriptions.${row.original.code}`)
        ),
      ]),
  },
  {
    id: 'mode',
    meta: { label: t('agent_config.tool_mode') },
    header: () => t('agent_config.tool_mode'),
    cell: ({ row }) =>
      h('div', { class: 'space-y-1' }, [
        h(
          Select,
          {
            modelValue: row.original.mode,
            disabled: !canUpdate.value || saving.value || !row.original.modeConfigurable,
            'aria-label': t('agent_config.set_tool_mode', {
              name: t(`agent_config.tool_names.${row.original.code}`),
            }),
            'onUpdate:modelValue': (mode: unknown) => setMode(row.original.code, mode),
          },
          () => [
            h(SelectTrigger, { class: 'w-48' }, () => h(SelectValue)),
            h(SelectContent, {}, () => [
              h(SelectItem, { value: 'direct', disabled: row.original.requiresConfirmation }, () =>
                t('agent_config.tool_mode_direct')
              ),
              h(SelectItem, { value: 'confirm' }, () =>
                t(
                  row.original.requiresConfirmation
                    ? 'agent_config.tool_mode_confirm_required'
                    : 'agent_config.tool_mode_confirm'
                )
              ),
            ]),
          ]
        ),
        ...(!row.original.modeConfigurable
          ? [
              h(
                'p',
                { class: 'max-w-48 text-xs text-muted-foreground' },
                t(
                  row.original.requiresConfirmation
                    ? 'agent_config.tool_confirmation_required'
                    : 'agent_config.tool_mode_fixed'
                )
              ),
            ]
          : []),
      ]),
  },
  {
    id: 'enabled',
    meta: { label: t('agent_config.enabled') },
    header: () => t('agent_config.enabled'),
    cell: ({ row }) =>
      h(Switch, {
        modelValue: row.original.enabled,
        disabled: !canUpdate.value || saving.value,
        title: t('agent_config.toggle_enabled', {
          name: t(`agent_config.tool_names.${row.original.code}`),
        }),
        'aria-label': t('agent_config.toggle_enabled', {
          name: t(`agent_config.tool_names.${row.original.code}`),
        }),
        'onUpdate:modelValue': (enabled: boolean) => setEnabled(row.original.code, enabled),
      }),
  },
])

async function load() {
  loading.value = true
  try {
    const result = await getAgentTools(auth.token)
    tools.value = result.tools.map((tool) => ({ ...tool }))
    saved.value = serialize(tools.value)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.tools_load_failed'))
  } finally {
    loading.value = false
  }
}

function setEnabled(code: string, enabled: boolean) {
  if (saving.value) return
  const tool = tools.value.find((item) => item.code === code)
  if (tool) {
    tool.enabled = enabled
    void save()
  }
}

function setMode(code: string, mode: unknown) {
  if (saving.value) return
  if (mode !== 'direct' && mode !== 'confirm') return
  const tool = tools.value.find((item) => item.code === code)
  if (!tool?.modeConfigurable) return
  if (tool) {
    tool.mode = mode
    void save()
  }
}

async function save() {
  if (saving.value) return
  const previous = saved.value
  saving.value = true
  try {
    const result = await updateAgentTools(auth.token, tools.value)
    tools.value = result.tools.map((tool) => ({ ...tool }))
    saved.value = serialize(tools.value)
    toast.success(t('agent_config.tools_saved'))
  } catch (error) {
    if (saved.value === previous) tools.value = JSON.parse(previous) as AgentToolSetting[]
    toast.error(error instanceof Error ? error.message : t('agent_config.tools_save_failed'))
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <Card class="flex min-h-0 flex-1 flex-col">
    <CardHeader class="flex shrink-0 flex-row items-start justify-between gap-4">
      <div class="min-w-0 space-y-1.5">
        <CardTitle class="flex items-center gap-2">{{ t('agent_config.tools_title') }}</CardTitle>
        <CardDescription>{{ t('agent_config.tools_description') }}</CardDescription>
      </div>
      <div class="flex shrink-0 gap-2">
        <Button
          variant="outline"
          size="icon"
          :disabled="loading || saving"
          :title="t('common.refresh')"
          @click="load"
        >
          <LoaderCircle v-if="saving" class="size-4 animate-spin" />
          <RefreshCw v-else class="size-4" />
        </Button>
      </div>
    </CardHeader>
    <CardContent class="flex min-h-0 min-w-0 flex-1 flex-col pb-6">
      <p v-if="loading" class="py-8 text-center text-sm text-muted-foreground">
        {{ t('common.loading') }}
      </p>
      <DataTable
        v-else
        :columns="columns"
        :data="tools"
        :show-search="false"
        :show-view="false"
        :empty-message="t('agent_config.tools_empty')"
      />
    </CardContent>
  </Card>
</template>
