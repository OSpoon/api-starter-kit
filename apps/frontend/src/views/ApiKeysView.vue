<script setup lang="ts">
import { Check, Copy, Plus, RefreshCw, Trash2 } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { toast } from 'vue-sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import DataTable from '@/components/common/DataTable.vue'
import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import ListPage from '@/components/common/ListPage.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import ApiKeyForm from '@/components/workbench/ApiKeyForm.vue'
import { useAsyncToast } from '@/composables/useAsyncToast'
import type { ApiKeySummary } from '@/features/api-keys/api'
import { badgeToneClass, createApiKey, listApiKeys, revokeApiKey } from '@/features/api-keys/api'
import { copyText } from '@/lib/clipboard'
import { formatDateOnly, formatDateTime } from '@/lib/format'
import { usePermission } from '@/lib/permission'
import { useDelayedDialog } from '@/lib/use-delayed-dialog'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { can } = usePermission()
const { t } = useI18n()
const { runWithToast } = useAsyncToast()

const keys = ref<ApiKeySummary[]>([])
const page = ref(1)
const pageCount = ref(1)
const loading = ref(false)
const {
  open: dialogOpen,
  mounted: dialogMounted,
  show: showDialog,
  close: closeDialog,
  onOpenChange: onDialogOpenChange,
} = useDelayedDialog()
const creating = ref(false)

const {
  open: tokenDialogOpen,
  mounted: tokenDialogMounted,
  show: showTokenDialog,
  close: closeTokenDialog,
  onOpenChange: onTokenDialogOpenChange,
} = useDelayedDialog()
const createdToken = ref('')
const copied = ref(false)

const revokeDialogOpen = ref(false)
const pendingRevokeId = ref<number | null>(null)
const pendingRevokeIsRemove = ref(false)
const revoking = ref(false)

const columns = computed<ColumnDef<ApiKeySummary>[]>(() => [
  {
    accessorKey: 'id',
    meta: { label: t('api_keys.id') },
    header: () => t('api_keys.id'),
    cell: ({ row }) =>
      h('code', { class: 'font-mono text-xs text-muted-foreground' }, String(row.original.id)),
  },
  {
    accessorKey: 'name',
    meta: { label: t('api_keys.name') },
    header: () => t('api_keys.name'),
    cell: ({ row }) => h('div', { class: 'font-medium' }, row.original.name),
  },
  {
    id: 'key',
    meta: { label: t('api_keys.key') },
    header: () => t('api_keys.key'),
    cell: ({ row }) => {
      const key = row.original
      const value = key.key ?? `${key.prefix}••••••••`

      return h('div', { class: 'flex min-w-0 items-center gap-1' }, [
        h(
          'code',
          {
            class: 'block max-w-70 truncate font-mono text-xs text-muted-foreground',
            title: value,
          },
          value
        ),
        key.key
          ? h(
              Button,
              {
                variant: 'ghost',
                size: 'icon',
                class: 'shrink-0 text-muted-foreground hover:text-primary',
                title: t('api_keys.copy_success'),
                'aria-label': t('api_keys.copy_success'),
                onClick: () => void copyTokenValue(key.key!),
              },
              () => h(Copy, { class: 'size-4' })
            )
          : null,
      ])
    },
  },
  {
    id: 'status',
    meta: { label: t('api_keys.key_status') },
    header: () => t('api_keys.key_status'),
    cell: ({ row }) => {
      const key = row.original
      return h(
        Badge,
        {
          variant: 'outline',
          class: key.revokedAt ? badgeToneClass('muted') : badgeToneClass('success'),
        },
        () => (key.revokedAt ? t('api_keys.revoked') : t('api_keys.active'))
      )
    },
  },
  {
    accessorKey: 'createdAt',
    meta: { label: t('api_keys.created_at') },
    header: () => t('api_keys.created_at'),
    cell: ({ row }) => formatDateOnly(row.original.createdAt),
  },
  {
    accessorKey: 'lastUsedAt',
    meta: { label: t('api_keys.last_used') },
    header: () => t('api_keys.last_used'),
    cell: ({ row }) => formatDateTime(row.original.lastUsedAt, t('api_keys.never_used')),
  },
  {
    id: 'actions',
    enableHiding: false,
    meta: { label: t('common.actions') },
    header: () => h('div', { class: 'text-right' }, t('common.actions')),
    cell: ({ row }) => {
      const key = row.original
      return h('div', { class: 'flex justify-end gap-1' }, [
        can('api-keys:delete')
          ? h(
              Button,
              {
                variant: 'ghost',
                size: 'icon',
                class: 'text-destructive',
                title: t('common.delete'),
                'aria-label': t('common.delete'),
                onClick: () => requestRevokeKey(key.id, Boolean(key.revokedAt)),
              },
              () => h(Trash2, { class: 'size-4' })
            )
          : null,
      ])
    },
  },
])

async function fetchKeys(nextPage = page.value) {
  loading.value = true
  try {
    const result = await listApiKeys(auth.token, nextPage)
    keys.value = result.items
    page.value = result.meta.currentPage
    pageCount.value = result.meta.lastPage
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('api_keys.fetch_failed'))
  } finally {
    loading.value = false
  }
}

function refreshKeys() {
  runWithToast(fetchKeys(), {
    loading: t('common.loading'),
    success: t('common.success'),
    error: t('api_keys.fetch_failed'),
  })
}

function openCreateDialog() {
  showDialog()
}

async function copyTokenValue(value: string) {
  try {
    await copyText(value)
    toast.success(t('api_keys.copy_success'))
  } catch {
    toast.error(t('api_keys.copy_failed'))
  }
}

async function handleCreateKey(values: { name: string; expiresIn: string }) {
  creating.value = true
  try {
    const apiKey = await createApiKey(auth.token, {
      name: values.name.trim(),
      expiresIn: values.expiresIn,
    })
    createdToken.value = apiKey.key || ''
    closeDialog()
    showTokenDialog()
    await fetchKeys()
    toast.success(t('api_keys.create_success'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('api_keys.create_failed'))
  } finally {
    creating.value = false
  }
}

function requestRevokeKey(id: number, revoked: boolean) {
  pendingRevokeId.value = id
  pendingRevokeIsRemove.value = revoked
  revokeDialogOpen.value = true
}

async function confirmRevokeKey() {
  if (!pendingRevokeId.value) {
    return
  }

  const id = pendingRevokeId.value
  revoking.value = true

  try {
    const result = await revokeApiKey(auth.token, id)
    revokeDialogOpen.value = false
    pendingRevokeId.value = null

    if ('deleted' in result && result.deleted) {
      const nextPage = keys.value.length <= 1 && page.value > 1 ? page.value - 1 : page.value
      if (nextPage !== page.value) {
        page.value = nextPage
      } else {
        await fetchKeys(nextPage)
      }
      toast.success(t('api_keys.remove_success'))
    } else {
      await fetchKeys()
      toast.success(t('api_keys.revoke_success'))
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('api_keys.revoke_failed'))
  } finally {
    revoking.value = false
  }
}

async function copyToken() {
  try {
    await copyText(createdToken.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
    toast.success(t('api_keys.copy_success'))
  } catch {
    toast.error(t('api_keys.copy_failed'))
  }
}

onMounted(() => {
  void fetchKeys()
})

watch(page, (nextPage) => void fetchKeys(nextPage))
</script>

<template>
  <ListPage
    :title="t('api_keys.title')"
    :description="t('api_keys.desc')"
    :loading="loading"
    :refresh-label="t('common.refresh')"
    :action-label="t('api_keys.generate_new')"
    :show-action="can('api-keys:create')"
    @refresh="refreshKeys"
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
      :data="keys"
      :search-keys="['name']"
      :search-placeholder="t('api_keys.filter_keyword')"
      storage-key="api-keys-table"
      :empty-message="loading ? t('common.loading') : t('api_keys.no_keys')"
      :server-pagination="{ page, pageCount }"
      @page-change="page = $event"
    />

    <template #dialogs>
      <Dialog v-if="dialogMounted" :open="dialogOpen" @update:open="onDialogOpenChange">
        <FormDialogContent
          :title="t('api_keys.dialog_create_title')"
          :description="t('api_keys.dialog_create_desc')"
          class="overflow-visible sm:max-w-106.25"
        >
          <ApiKeyForm
            class="flex-1 overflow-hidden"
            :open="dialogOpen"
            :creating="creating"
            @success="handleCreateKey"
            @cancel="closeDialog"
          />
        </FormDialogContent>
      </Dialog>

      <Dialog
        v-if="tokenDialogMounted"
        :open="tokenDialogOpen"
        @update:open="onTokenDialogOpenChange"
      >
        <FormDialogContent
          :title="t('api_keys.dialog_token_title')"
          :description="t('api_keys.dialog_token_desc')"
          class="sm:max-w-155"
        >
          <div class="px-6 pb-6">
            <div class="flex items-center gap-2 overflow-x-auto rounded-md border bg-muted p-3">
              <p class="shrink-0 font-mono text-sm/snug whitespace-nowrap">
                {{ createdToken }}
              </p>
              <Button size="sm" variant="secondary" class="ml-auto shrink-0" @click="copyToken">
                <Check v-if="copied" class="mr-1 size-4 text-chart-3" />
                <Copy v-else class="mr-1 size-4" />
                {{ copied ? t('api_keys.copied') : t('api_keys.copy') }}
              </Button>
            </div>
          </div>
          <FormDialogFooter class="justify-end">
            <Button @click="closeTokenDialog">{{ t('api_keys.done') }}</Button>
          </FormDialogFooter>
        </FormDialogContent>
      </Dialog>

      <ConfirmDialog
        v-model:open="revokeDialogOpen"
        :title="pendingRevokeIsRemove ? t('api_keys.remove_title') : t('api_keys.revoke_title')"
        :description="
          pendingRevokeIsRemove ? t('api_keys.remove_confirm') : t('api_keys.revoke_confirm')
        "
        :confirm-label="pendingRevokeIsRemove ? t('common.delete') : t('api_keys.revoke')"
        :loading="revoking"
        @confirm="confirmRevokeKey"
      />
    </template>
  </ListPage>
</template>
