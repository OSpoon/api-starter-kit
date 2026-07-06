<script setup lang="ts">
import { Check, Copy, Plus, RefreshCw, Trash2 } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { computed, h, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import DataTable from '@/components/common/DataTable.vue'
import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import ManagementListPage from '@/components/common/ManagementListPage.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import ApiKeyForm from '@/components/workbench/ApiKeyForm.vue'
import { useAsyncToast } from '@/composables/useAsyncToast'
import type { ApiKeySummary } from '@/lib/api-key-api'
import { badgeToneClass, createApiKey, listApiKeys, revokeApiKey } from '@/lib/api-key-api'
import { copyText } from '@/lib/clipboard'
import { formatDateOnly, formatDateTime } from '@/lib/format'
import { useDelayedDialog } from '@/lib/use-delayed-dialog'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { t } = useI18n()
const { runWithToast } = useAsyncToast()

const keys = ref<ApiKeySummary[]>([])
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
            class: 'block max-w-[280px] truncate font-mono text-xs text-muted-foreground',
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
        h(
          Button,
          {
            variant: 'ghost',
            size: 'icon',
            class: 'text-destructive',
            onClick: () => requestRevokeKey(key.id, Boolean(key.revokedAt)),
          },
          () => h(Trash2, { class: 'size-4' })
        ),
      ])
    },
  },
])

async function fetchKeys() {
  loading.value = true
  try {
    keys.value = await listApiKeys(auth.token)
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
      keys.value = keys.value.filter((key) => key.id !== id)
      toast.success(t('api_keys.remove_success'))
    } else {
      keys.value = keys.value.map((key) => (key.id === result.id ? result : key))
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
</script>

<template>
  <ManagementListPage
    :title="t('api_keys.title')"
    :description="t('api_keys.desc')"
    :loading="loading"
    :refresh-label="t('common.refresh')"
    :action-label="t('api_keys.generate_new')"
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
    />

    <template #dialogs>
      <Dialog v-if="dialogMounted" :open="dialogOpen" @update:open="onDialogOpenChange">
        <FormDialogContent
          :title="t('api_keys.dialog_create_title')"
          :description="t('api_keys.dialog_create_desc')"
          class="sm:max-w-[425px]"
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
          class="sm:max-w-[620px]"
        >
          <div class="px-6 pb-6">
            <div class="flex items-center gap-2 overflow-x-auto rounded-md border bg-muted p-3">
              <p class="shrink-0 whitespace-nowrap font-mono text-sm leading-snug">
                {{ createdToken }}
              </p>
              <Button size="sm" variant="secondary" class="ml-auto h-8 shrink-0" @click="copyToken">
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
  </ManagementListPage>
</template>
