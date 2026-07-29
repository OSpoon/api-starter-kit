<script setup lang="ts">
import { FilePenLine, Plus, RefreshCw, RotateCw, Trash2 } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { toast } from 'vue-sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import DataTable from '@/components/common/DataTable.vue'
import ListPage from '@/components/common/ListPage.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  type KnowledgeDocument,
  type KnowledgeDocumentInput,
  listKnowledgeDocuments,
  reindexKnowledgeDocument,
  updateKnowledgeDocument,
} from '@/features/knowledge/api'
import KnowledgeDocumentDialog from '@/features/knowledge/components/KnowledgeDocumentDialog.vue'
import { badgeToneClass } from '@/lib/api-key-api'
import { formatDateTime } from '@/lib/format'
import { listSystemRoleCatalog, type SystemRoleOption } from '@/lib/rbac-api'
import { useDelayedDialog } from '@/lib/use-delayed-dialog'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { t } = useI18n()
const documents = ref<KnowledgeDocument[]>([])
const page = ref(1)
const pageCount = ref(1)
const loading = ref(false)
const saving = ref(false)
const selectedDocument = ref<KnowledgeDocument | null>(null)
const pendingDelete = ref<KnowledgeDocument | null>(null)
const deleteDialogOpen = ref(false)
const deleting = ref(false)
const pendingReindex = ref<KnowledgeDocument | null>(null)
const reindexDialogOpen = ref(false)
const reindexing = ref(false)
const roles = ref<SystemRoleOption[]>([])
const {
  open: dialogOpen,
  mounted: dialogMounted,
  show: showDialog,
  close: closeDialog,
  onOpenChange: onDialogOpenChange,
} = useDelayedDialog()

const columns = computed<ColumnDef<KnowledgeDocument>[]>(() => [
  {
    accessorKey: 'title',
    meta: { label: t('knowledge.name') },
    header: () => t('knowledge.name'),
    cell: ({ row }) =>
      h(
        'div',
        { class: 'max-w-80 truncate font-medium', title: row.original.title },
        row.original.title
      ),
  },
  {
    id: 'index',
    meta: { label: t('knowledge.index_status') },
    header: () => t('knowledge.index_status'),
    cell: ({ row }) =>
      h(
        Badge,
        {
          variant: 'outline',
          class: badgeToneClass(row.original.chunkCount > 0 ? 'success' : 'warning'),
        },
        () =>
          row.original.chunkCount > 0
            ? t('knowledge.indexed', { count: row.original.chunkCount })
            : t('knowledge.not_indexed')
      ),
  },
  {
    id: 'roles',
    meta: { label: t('knowledge.roles') },
    header: () => t('knowledge.roles'),
    cell: ({ row }) =>
      h(
        'span',
        { class: 'text-sm text-muted-foreground' },
        row.original.roles.map((role) => role.name).join(', ') || t('knowledge.all_readers')
      ),
  },
  {
    accessorKey: 'updatedAt',
    meta: { label: t('knowledge.updated_at') },
    header: () => t('knowledge.updated_at'),
    cell: ({ row }) => formatDateTime(row.original.updatedAt),
  },
  {
    id: 'actions',
    enableHiding: false,
    meta: { label: t('common.actions') },
    header: () => h('div', { class: 'text-right' }, t('common.actions')),
    cell: ({ row }) =>
      h('div', { class: 'flex justify-end gap-1' }, [
        h(
          Button,
          {
            variant: 'ghost',
            size: 'icon',
            title: t('knowledge.reindex'),
            'aria-label': t('knowledge.reindex'),
            onClick: () => requestReindex(row.original),
          },
          () => h(RotateCw, { class: 'size-4' })
        ),
        h(
          Button,
          {
            variant: 'ghost',
            size: 'icon',
            title: t('common.edit'),
            'aria-label': t('common.edit'),
            onClick: () => openEditDialog(row.original),
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
            onClick: () => requestDelete(row.original),
          },
          () => h(Trash2, { class: 'size-4' })
        ),
      ]),
  },
])

async function fetchDocuments(nextPage = page.value) {
  loading.value = true
  try {
    const result = await listKnowledgeDocuments(auth.token, nextPage)
    documents.value = result.items
    page.value = result.meta.currentPage
    pageCount.value = result.meta.lastPage
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('knowledge.fetch_failed'))
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  selectedDocument.value = null
  showDialog()
}

function openEditDialog(document: KnowledgeDocument) {
  selectedDocument.value = document
  showDialog()
}

function requestDelete(document: KnowledgeDocument) {
  pendingDelete.value = document
  deleteDialogOpen.value = true
}

function requestReindex(document: KnowledgeDocument) {
  pendingReindex.value = document
  reindexDialogOpen.value = true
}

async function saveDocument(input: KnowledgeDocumentInput) {
  saving.value = true
  try {
    if (selectedDocument.value) {
      await updateKnowledgeDocument(auth.token, selectedDocument.value.id, input)
    } else {
      await createKnowledgeDocument(auth.token, input)
    }
    closeDialog()
    await fetchDocuments()
    toast.success(t('knowledge.save_success'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('knowledge.save_failed'))
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  try {
    await deleteKnowledgeDocument(auth.token, pendingDelete.value.id)
    deleteDialogOpen.value = false
    pendingDelete.value = null
    await fetchDocuments(
      documents.value.length <= 1 && page.value > 1 ? page.value - 1 : page.value
    )
    toast.success(t('knowledge.delete_success'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('knowledge.delete_failed'))
  } finally {
    deleting.value = false
  }
}

async function confirmReindex() {
  if (!pendingReindex.value) return
  reindexing.value = true
  try {
    await reindexKnowledgeDocument(auth.token, pendingReindex.value.id)
    reindexDialogOpen.value = false
    pendingReindex.value = null
    await fetchDocuments()
    toast.success(t('knowledge.reindex_success'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('knowledge.reindex_failed'))
  } finally {
    reindexing.value = false
  }
}

onMounted(() => void fetchDocuments())
onMounted(() => void listSystemRoleCatalog(auth.token).then((items) => (roles.value = items)))
watch(page, (nextPage) => void fetchDocuments(nextPage))
</script>

<template>
  <ListPage
    :title="t('knowledge.title')"
    :description="t('knowledge.desc')"
    :loading="loading"
    :refresh-label="t('common.refresh')"
    :action-label="t('knowledge.create')"
    :show-action="true"
    @refresh="() => void fetchDocuments()"
    @action="openCreateDialog"
  >
    <template #refresh-icon
      ><RefreshCw class="size-4" :class="{ 'animate-spin': loading }"
    /></template>
    <template #action-icon><Plus class="size-4" /></template>
    <DataTable
      :columns="columns"
      :data="documents"
      :search-keys="['title']"
      :search-placeholder="t('knowledge.search_placeholder')"
      storage-key="knowledge-documents-table"
      :empty-message="loading ? t('common.loading') : t('knowledge.empty')"
      :server-pagination="{ page, pageCount }"
      @page-change="page = $event"
    />
    <template #dialogs>
      <Dialog v-if="dialogMounted" :open="dialogOpen" @update:open="onDialogOpenChange">
        <KnowledgeDocumentDialog
          v-model:open="dialogOpen"
          :document="selectedDocument"
          :roles="roles"
          :saving="saving"
          @save="saveDocument"
        />
      </Dialog>
      <ConfirmDialog
        v-model:open="deleteDialogOpen"
        :title="t('knowledge.delete_title')"
        :description="t('knowledge.delete_desc', { title: pendingDelete?.title ?? '' })"
        :confirm-label="t('common.delete')"
        :loading="deleting"
        @confirm="confirmDelete"
      />
      <ConfirmDialog
        v-model:open="reindexDialogOpen"
        :title="t('knowledge.reindex_title')"
        :description="t('knowledge.reindex_desc', { title: pendingReindex?.title ?? '' })"
        :confirm-label="t('knowledge.reindex')"
        :loading="reindexing"
        @confirm="confirmReindex"
      />
    </template>
  </ListPage>
</template>
