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
import AgentSkillDialog from '@/features/agent-config/AgentSkillDialog.vue'
import type { AgentSkill, AgentSkillSummary } from '@/features/agent-config/api'
import {
  createAgentSkill,
  deleteAgentSkill,
  getAgentSkill,
  listAgentSkills,
  updateAgentSkill,
} from '@/features/agent-config/api'
import { usePermission } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
const { can } = usePermission()
const items = ref<AgentSkillSummary[]>([])
const page = ref(1)
const pageCount = ref(1)
const loading = ref(false)
const saving = ref(false)
const loadingSkill = ref(false)
const dialogOpen = ref(false)
const selected = ref<AgentSkill | null>(null)
const pendingDelete = ref<AgentSkillSummary | null>(null)
const deleteOpen = ref(false)
const deleting = ref(false)
const updatingEnabledId = ref<number | null>(null)

const columns = computed<ColumnDef<AgentSkillSummary>[]>(() => [
  {
    accessorKey: 'name',
    meta: { label: t('agent_config.skill_name') },
    header: () => t('agent_config.skill_name'),
    cell: ({ row }) =>
      h(
        'div',
        { class: 'max-w-56 truncate font-medium', title: row.original.name },
        row.original.name
      ),
  },
  {
    accessorKey: 'code',
    meta: { label: t('agent_config.skill_code') },
    header: () => t('agent_config.skill_code'),
    cell: ({ row }) => h('code', { class: 'text-xs' }, row.original.code),
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
      h('div', { class: 'flex justify-end gap-1' }, [
        h(Switch, {
          modelValue: row.original.enabled,
          'aria-label': t('agent_config.toggle_enabled', { name: row.original.name }),
          title: t('agent_config.toggle_enabled', { name: row.original.name }),
          disabled:
            !can('agent-config:update') ||
            loading.value ||
            saving.value ||
            deleting.value ||
            loadingSkill.value ||
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
              loadingSkill.value ||
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
              loadingSkill.value ||
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
    const result = await listAgentSkills(auth.token, nextPage)
    items.value = result.items
    page.value = result.meta.currentPage
    pageCount.value = result.meta.lastPage
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.skills_load_failed'))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  selected.value = null
  dialogOpen.value = true
}

async function openEdit(skill: AgentSkillSummary) {
  loadingSkill.value = true
  try {
    selected.value = await getAgentSkill(auth.token, skill.id)
    dialogOpen.value = true
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.skill_load_failed'))
  } finally {
    loadingSkill.value = false
  }
}

function requestDelete(skill: AgentSkillSummary) {
  pendingDelete.value = skill
  deleteOpen.value = true
}

async function save(input: Omit<AgentSkill, 'id' | 'updatedAt' | 'enabled'>) {
  saving.value = true
  try {
    if (selected.value) await updateAgentSkill(auth.token, selected.value.id, input)
    else await createAgentSkill(auth.token, { ...input, enabled: true })
    dialogOpen.value = false
    await load()
    toast.success(t('agent_config.skill_saved'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.skill_save_failed'))
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(skill: AgentSkillSummary, enabled: boolean) {
  updatingEnabledId.value = skill.id
  try {
    const updated = await updateAgentSkill(auth.token, skill.id, { enabled })
    items.value = items.value.map((item) =>
      item.id === skill.id
        ? { ...item, enabled: updated.enabled, updatedAt: updated.updatedAt }
        : item
    )
    toast.success(t('agent_config.enabled_updated'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.skill_save_failed'))
  } finally {
    updatingEnabledId.value = null
  }
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  try {
    await deleteAgentSkill(auth.token, pendingDelete.value.id)
    deleteOpen.value = false
    pendingDelete.value = null
    await load(items.value.length <= 1 && page.value > 1 ? page.value - 1 : page.value)
    toast.success(t('agent_config.skill_deleted'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.skill_delete_failed'))
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
        <CardTitle>{{ t('agent_config.skills_title') }}</CardTitle>
        <CardDescription>{{ t('agent_config.skills_description') }}</CardDescription>
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
          <Plus class="size-4" />{{ t('agent_config.create_skill') }}
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
        :empty-message="t('agent_config.skills_empty')"
        :server-pagination="{ page, pageCount }"
        @page-change="load"
      />
    </CardContent>
  </Card>
  <AgentSkillDialog v-model:open="dialogOpen" :skill="selected" :saving="saving" @save="save" />
  <ConfirmDialog
    v-model:open="deleteOpen"
    :title="t('agent_config.delete_skill_title')"
    :description="t('agent_config.delete_skill_description', { name: pendingDelete?.name ?? '' })"
    :loading="deleting"
    @confirm="confirmDelete"
  />
</template>
