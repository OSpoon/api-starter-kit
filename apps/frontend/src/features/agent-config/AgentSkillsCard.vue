<script setup lang="ts">
import { Download, RefreshCw, Trash2 } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { h } from 'vue'
import { toast } from 'vue-sonner'
import { z } from 'zod'

import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import DataTable from '@/components/common/DataTable.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { firstFormError } from '@/lib/form-validation'
import { usePermission } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

import {
  type AgentSkill,
  installAgentSkills,
  listAgentSkills,
  removeAgentSkill,
  updateAgentSkill,
} from './api'

const { t } = useI18n()
const auth = useAuthStore()
const { can } = usePermission()
const items = ref<AgentSkill[]>([])
const page = ref(1)
const pageCount = ref(1)
const loading = ref(false)
const installing = ref(false)
const changingSkill = ref<string | null>(null)
const pendingDelete = ref<AgentSkill | null>(null)
const deleteOpen = ref(false)

const schema = toTypedSchema(
  z.object({
    source: z
      .string()
      .trim()
      .min(1, t('agent_config.skills_source_required'))
      .max(2048, t('agent_config.skills_source_max')),
  })
)
const form = useForm({ validationSchema: schema, initialValues: { source: '' } })

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

const submit = form.handleSubmit(
  async ({ source }) => {
    installing.value = true
    try {
      const result = await installAgentSkills(auth.token, source)
      form.resetForm({ values: { source: '' } })
      await load(1)
      toast.success(
        result.installed.length
          ? t('agent_config.skills_installed', { count: result.installed.length })
          : t('agent_config.skills_install_complete')
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('agent_config.skills_install_failed'))
    } finally {
      installing.value = false
    }
  },
  ({ errors }) => toast.error(firstFormError(errors, t('common.form_check_errors')))
)

async function toggleSkill(skill: AgentSkill, enabled: boolean) {
  changingSkill.value = skill.code
  try {
    const updated = await updateAgentSkill(auth.token, skill.code, enabled)
    items.value = items.value.map((item) => (item.code === skill.code ? updated : item))
    toast.success(t('agent_config.enabled_updated'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.skills_update_failed'))
  } finally {
    changingSkill.value = null
  }
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  changingSkill.value = pendingDelete.value.code
  try {
    await removeAgentSkill(auth.token, pendingDelete.value.code)
    deleteOpen.value = false
    pendingDelete.value = null
    await load(items.value.length <= 1 && page.value > 1 ? page.value - 1 : page.value)
    toast.success(t('agent_config.skills_removed'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('agent_config.skills_remove_failed'))
  } finally {
    changingSkill.value = null
  }
}

const columns = computed<ColumnDef<AgentSkill>[]>(() => [
  {
    accessorKey: 'name',
    meta: { label: t('agent_config.skill_name') },
    header: () => t('agent_config.skill_name'),
    cell: ({ row }) =>
      h(
        'div',
        { class: 'max-w-48 truncate font-medium', title: row.original.name },
        row.original.name
      ),
  },
  {
    accessorKey: 'description',
    meta: { label: t('agent_config.skill_description') },
    header: () => t('agent_config.skill_description'),
    cell: ({ row }) =>
      h(
        'div',
        {
          class: 'max-w-lg truncate text-sm text-muted-foreground',
          title: row.original.description,
        },
        row.original.description
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
      h(Switch, {
        modelValue: row.original.enabled,
        'aria-label': t('agent_config.toggle_enabled', { name: row.original.name }),
        title: t('agent_config.toggle_enabled', { name: row.original.name }),
        disabled:
          !can('agent-config:update') ||
          loading.value ||
          installing.value ||
          changingSkill.value !== null,
        'onUpdate:modelValue': (enabled: boolean) => void toggleSkill(row.original, enabled),
      }),
  },
  {
    id: 'actions',
    enableHiding: false,
    meta: { label: t('common.actions') },
    header: () => h('div', { class: 'text-right' }, t('common.actions')),
    cell: ({ row }) =>
      h('div', { class: 'flex justify-end' }, [
        h(
          Button,
          {
            variant: 'ghost',
            size: 'icon',
            class: 'text-destructive',
            title: t('common.delete'),
            'aria-label': t('agent_config.remove_skill', { name: row.original.name }),
            disabled:
              !can('agent-config:update') ||
              loading.value ||
              installing.value ||
              changingSkill.value !== null,
            onClick: () => {
              pendingDelete.value = row.original
              deleteOpen.value = true
            },
          },
          () => h(Trash2, { class: 'size-4' })
        ),
      ]),
  },
])

onMounted(() => void load())
</script>

<template>
  <Card class="flex min-h-0 flex-1 flex-col">
    <CardHeader class="flex shrink-0 flex-row items-start justify-between gap-4">
      <div class="min-w-0 space-y-1.5">
        <CardTitle>{{ t('agent_config.skills_title') }}</CardTitle>
        <CardDescription>
          {{ t('agent_config.skills_description') }}
          <a
            href="https://github.com/OSpoon/starter-skills"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary underline underline-offset-4 hover:text-primary/80"
          >
            {{ t('agent_config.skills_template_link') }}
          </a>
        </CardDescription>
      </div>
      <Button
        variant="outline"
        size="sm"
        :disabled="loading || installing"
        :aria-label="t('common.refresh')"
        :title="t('common.refresh')"
        @click="load()"
      >
        <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
      </Button>
    </CardHeader>
    <CardContent class="flex min-h-0 flex-1 flex-col gap-6">
      <form
        class="grid shrink-0 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]"
        @submit.prevent="submit"
      >
        <FormField v-slot="{ componentField }" name="source" :validate-on-blur="false">
          <FormItem>
            <FormLabel>{{ t('agent_config.skills_source') }}</FormLabel>
            <FormControl>
              <Input
                v-bind="componentField"
                :disabled="!can('agent-config:update') || installing"
                :placeholder="t('agent_config.skills_source_placeholder')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
        <Button
          type="submit"
          class="md:mt-5.5"
          :disabled="!can('agent-config:update') || installing || loading"
        >
          <RefreshCw v-if="installing" class="size-4 animate-spin" />
          <Download v-else class="size-4" />
          {{ t('agent_config.install_skill') }}
        </Button>
      </form>
      <p class="shrink-0 text-sm text-muted-foreground">
        {{ t('agent_config.skills_source_hint') }}
      </p>
      <DataTable
        class="min-h-0 flex-1"
        :columns="columns"
        :data="items"
        :show-search="false"
        :show-view="false"
        :empty-message="loading ? t('common.loading') : t('agent_config.skills_empty')"
        :server-pagination="{ page, pageCount }"
        @page-change="load"
      />
    </CardContent>
  </Card>
  <ConfirmDialog
    v-model:open="deleteOpen"
    :title="t('agent_config.remove_skill_title')"
    :description="t('agent_config.remove_skill_description', { name: pendingDelete?.name ?? '' })"
    :loading="changingSkill !== null"
    @confirm="confirmDelete"
  />
</template>
