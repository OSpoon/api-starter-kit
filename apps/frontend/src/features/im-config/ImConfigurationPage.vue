<script setup lang="ts">
import { Pencil, Plus, Power, PowerOff, RefreshCw } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { toast } from 'vue-sonner'

import DataTable from '@/components/common/DataTable.vue'
import DataTableFacetFilter from '@/components/common/DataTableFacetFilter.vue'
import DataTableTextFilter from '@/components/common/DataTableTextFilter.vue'
import FormDialogContent from '@/components/common/FormDialogContent.vue'
import ListPage from '@/components/common/ListPage.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useRemoteList } from '@/composables/useRemoteList'
import { formatDateTime } from '@/lib/format'
import { usePermission } from '@/lib/permission'
import { useDelayedDialog } from '@/lib/use-delayed-dialog'
import { useAuthStore } from '@/stores/auth'

import type { ImBot, ImBotChannel, ImBotInput } from './api'
import { createImBot, listImBots, updateImBot } from './api'
import ImBotForm from './ImBotForm.vue'

const { t } = useI18n()
const auth = useAuthStore()
const { can } = usePermission()
const bots = ref<ImBot[]>([])
const page = ref(1)
const pageCount = ref(1)
const search = ref('')
const channelFilter = ref<ImBotChannel[]>([])
const loading = ref(true)
const loadError = ref(false)
const saving = ref(false)
const togglingId = ref<number | null>(null)
const selectedBot = ref<ImBot | null>(null)
const {
  open: dialogOpen,
  mounted: dialogMounted,
  show: showDialog,
  close: closeDialog,
  onOpenChange: onDialogOpenChange,
} = useDelayedDialog()

const channelLabel: Record<ImBotChannel, string> = {
  wecom: 'im_config.wecom',
  dingtalk: 'im_config.dingtalk',
  feishu: 'im_config.feishu',
}
const channelOptions = computed(() =>
  (['wecom', 'dingtalk', 'feishu'] as const).map((channel) => ({
    value: channel,
    label: t(channelLabel[channel]),
  }))
)

const columns = computed<ColumnDef<ImBot>[]>(() => [
  {
    accessorKey: 'name',
    meta: { label: t('im_config.name') },
    header: () => t('im_config.name'),
    cell: ({ row }) => h('div', { class: 'font-medium' }, row.original.name),
  },
  {
    accessorKey: 'channel',
    meta: { label: t('im_config.platform') },
    header: () => t('im_config.platform'),
    cell: ({ row }) => t(channelLabel[row.original.channel]),
  },
  {
    accessorKey: 'identifier',
    meta: { label: t('im_config.identifier') },
    header: () => t('im_config.identifier'),
    cell: ({ row }) =>
      h(
        'code',
        { class: 'font-mono text-xs text-muted-foreground' },
        row.original.identifier || '—'
      ),
  },
  {
    accessorKey: 'enabled',
    meta: { label: t('im_config.status') },
    header: () => t('im_config.status'),
    cell: ({ row }) =>
      h(
        Badge,
        {
          variant: 'outline',
          class: row.original.enabled ? 'text-chart-3' : 'text-muted-foreground',
        },
        () => (row.original.enabled ? t('common.enabled') : t('common.disabled'))
      ),
  },
  {
    accessorKey: 'secretConfigured',
    meta: { label: t('im_config.credentials') },
    header: () => t('im_config.credentials'),
    cell: ({ row }) =>
      h(
        'span',
        { class: 'text-sm text-muted-foreground' },
        row.original.secretConfigured ? t('im_config.configured') : t('im_config.not_configured')
      ),
  },
  {
    accessorKey: 'updatedAt',
    meta: { label: t('im_config.updated_at') },
    header: () => t('im_config.updated_at'),
    cell: ({ row }) => formatDateTime(row.original.updatedAt),
  },
  {
    id: 'actions',
    enableHiding: false,
    meta: { label: t('common.actions') },
    header: () => h('div', { class: 'text-right' }, t('common.actions')),
    cell: ({ row }) => {
      const bot = row.original
      if (!can('im-config:update')) return null
      return h('div', { class: 'flex justify-end gap-1' }, [
        h(
          Button,
          {
            variant: 'ghost',
            size: 'icon',
            title: t('common.edit'),
            'aria-label': t('common.edit'),
            onClick: () => openEditDialog(bot),
          },
          () => h(Pencil, { class: 'size-4' })
        ),
        h(
          Button,
          {
            variant: 'ghost',
            size: 'icon',
            disabled: togglingId.value === bot.id,
            title: bot.enabled ? t('im_config.disable') : t('im_config.enable'),
            'aria-label': bot.enabled ? t('im_config.disable') : t('im_config.enable'),
            onClick: () => void toggleBot(bot),
          },
          () => h(bot.enabled ? PowerOff : Power, { class: 'size-4', 'aria-hidden': true })
        ),
      ])
    },
  },
])

async function fetchBots(nextPage = page.value, isCurrent: () => boolean = () => true) {
  loading.value = true
  try {
    const result = await listImBots(auth.token, nextPage, search.value, 20, channelFilter.value)
    if (!isCurrent()) return
    bots.value = result.items
    page.value = result.meta.currentPage
    pageCount.value = result.meta.lastPage
    loadError.value = false
  } catch (error) {
    if (isCurrent()) {
      loadError.value = true
      toast.error(error instanceof Error ? error.message : t('im_config.load_failed'))
    }
  } finally {
    if (isCurrent()) loading.value = false
  }
}

const { runLoad } = useRemoteList(page, fetchBots)

function openCreateDialog() {
  selectedBot.value = null
  showDialog()
}

function openEditDialog(bot: ImBot) {
  selectedBot.value = bot
  showDialog()
}

async function saveBot(values: ImBotInput) {
  saving.value = true
  try {
    if (selectedBot.value) {
      await updateImBot(auth.token, selectedBot.value.id, values)
      toast.success(t('im_config.updated'))
    } else {
      await createImBot(auth.token, values)
      toast.success(t('im_config.created'))
    }
    closeDialog()
    await runLoad(page.value)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('im_config.save_failed'))
  } finally {
    saving.value = false
  }
}

async function toggleBot(bot: ImBot) {
  togglingId.value = bot.id
  try {
    await updateImBot(auth.token, bot.id, { enabled: !bot.enabled })
    await runLoad()
    toast.success(t(bot.enabled ? 'im_config.disabled' : 'im_config.enabled'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('im_config.save_failed'))
  } finally {
    togglingId.value = null
  }
}

function applyFilters() {
  void runLoad(1)
}

function resetFilters() {
  search.value = ''
  channelFilter.value = []
  void runLoad(1)
}
</script>

<template>
  <ListPage
    :title="t('im_config.title')"
    :description="t('im_config.description')"
    :loading="loading"
    :refresh-label="t('common.refresh')"
    :action-label="t('im_config.add_bot')"
    :show-action="can('im-config:update')"
    @refresh="() => void runLoad()"
    @action="openCreateDialog"
  >
    <template #refresh-icon>
      <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
    </template>
    <template #action-icon>
      <Plus class="size-4" />
    </template>

    <DataTable
      :columns="columns"
      :data="bots"
      :manual-filtering="true"
      filters-layout="inline"
      storage-key="im-bots-table"
      :empty-message="loading ? t('common.loading') : t('im_config.no_bots')"
      :error-message="loadError ? t('im_config.load_failed') : undefined"
      :server-pagination="{ page, pageCount }"
      @search="applyFilters"
      @reset="resetFilters"
      @page-change="page = $event"
      @retry="() => void runLoad()"
    >
      <template #filters>
        <DataTableTextFilter
          id="im-bot-name-filter"
          v-model="search"
          :label="t('im_config.name')"
          :placeholder="t('im_config.search_placeholder')"
        />
        <DataTableFacetFilter
          v-model="channelFilter"
          :label="t('im_config.platform')"
          :options="channelOptions"
        />
      </template>
    </DataTable>

    <template #dialogs>
      <Dialog v-if="dialogMounted" :open="dialogOpen" @update:open="onDialogOpenChange">
        <FormDialogContent
          :title="t(selectedBot ? 'im_config.edit_bot' : 'im_config.add_bot')"
          :description="t('im_config.form_description')"
          class="overflow-visible"
        >
          <ImBotForm
            :open="dialogOpen"
            :saving="saving"
            :bot="selectedBot"
            @save="saveBot"
            @cancel="closeDialog"
          />
        </FormDialogContent>
      </Dialog>
    </template>
  </ListPage>
</template>
