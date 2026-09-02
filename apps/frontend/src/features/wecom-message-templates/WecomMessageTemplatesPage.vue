<script setup lang="ts">
import { json } from '@codemirror/lang-json'
import { Copy, Pencil, Plus, RefreshCw, Send, Trash2 } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { toast } from 'vue-sonner'

import CodeEditor from '@/components/common/CodeEditor.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import DataTable from '@/components/common/DataTable.vue'
import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import ListPage from '@/components/common/ListPage.vue'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import {
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
} from '@/components/ui/tags-input'
import { useCopyText } from '@/lib/clipboard'
import { usePermission } from '@/lib/permission'
import { useDelayedDialog } from '@/lib/use-delayed-dialog'
import { useAuthStore } from '@/stores/auth'

import {
  buildWecomTemplateCurl,
  createWecomTemplate,
  deleteWecomTemplate,
  listWecomTemplates,
  updateWecomTemplate,
} from './api'
import WecomMessageTemplateForm from './components/WecomMessageTemplateForm.vue'
import { useWecomTemplateTest } from './composables/useWecomTemplateTest'
import type { WecomMessageTemplate, WecomTemplateInput } from './types'

const { t } = useI18n()
const auth = useAuthStore()
const { copy: copyText } = useCopyText()
const { can } = usePermission()
const templates = ref<WecomMessageTemplate[]>([])
const loading = ref(false)
const saving = ref(false)
const page = ref(1)
const pageCount = ref(1)
const editing = ref<WecomMessageTemplate | null>(null)
const { open, mounted, show, close, onOpenChange } = useDelayedDialog()
const deleteOpen = ref(false)
const deleting = ref(false)
const pending = ref<WecomMessageTemplate | null>(null)
const {
  mentionedList,
  mentionedMobileList,
  open: openTest,
  renderedTestPayload,
  sendConfirmed: sendConfirmedTest,
  testConfirmOpen,
  testOpen,
  testParameters,
  testParamsSyntaxValid,
  testParamsText,
  testTemplate,
  testing,
  confirm: confirmTest,
} = useWecomTemplateTest(
  () => auth.token,
  (key, params) => t(key, params as never)
)
function templateContent(template: WecomMessageTemplate) {
  const payload = template.payload
  const content = [
    (payload.text as { content?: unknown } | undefined)?.content,
    (payload.markdown as { content?: unknown } | undefined)?.content,
    (payload.markdown_v2 as { content?: unknown } | undefined)?.content,
  ].find((value): value is string => typeof value === 'string')
  if (content) return content
  return JSON.stringify(payload)
}
const columns = computed<ColumnDef<WecomMessageTemplate>[]>(() => [
  {
    accessorKey: 'id',
    header: () => t('wecom_templates.id'),
    meta: { label: t('wecom_templates.id') },
  },
  {
    accessorKey: 'name',
    header: () => t('wecom_templates.name'),
    meta: { label: t('wecom_templates.name') },
  },
  {
    accessorKey: 'msgtype',
    header: () => t('wecom_templates.msgtype'),
    meta: { label: t('wecom_templates.msgtype') },
    cell: ({ row }) => t(`wecom_templates.types.${row.original.msgtype}`),
  },
  {
    id: 'content',
    header: () => t('wecom_templates.content'),
    meta: { label: t('wecom_templates.content') },
    cell: ({ row }) => {
      const content = templateContent(row.original)
      return h('div', { class: 'max-w-120 truncate', title: content }, content)
    },
  },
  {
    id: 'actions',
    header: () => h('div', { class: 'text-right' }, t('common.actions')),
    meta: { label: t('common.actions') },
    cell: ({ row }) =>
      h('div', { class: 'flex justify-end gap-1' }, [
        can('wecom-templates:read')
          ? h(
              Button,
              {
                variant: 'ghost',
                size: 'icon',
                title: t('wecom_templates.copy_curl'),
                'aria-label': t('wecom_templates.copy_curl'),
                onClick: () => void copyCurl(row.original),
              },
              () => h(Copy, { class: 'size-4' })
            )
          : null,
        can('wecom-templates:test')
          ? h(
              Button,
              {
                variant: 'ghost',
                size: 'icon',
                title: t('wecom_templates.test'),
                'aria-label': t('wecom_templates.test'),
                onClick: () => openTest(row.original),
              },
              () => h(Send, { class: 'size-4' })
            )
          : null,
        can('wecom-templates:update')
          ? h(
              Button,
              {
                variant: 'ghost',
                size: 'icon',
                title: t('common.edit'),
                'aria-label': t('common.edit'),
                onClick: () => edit(row.original),
              },
              () => h(Pencil, { class: 'size-4' })
            )
          : null,
        can('wecom-templates:delete')
          ? h(
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
            )
          : null,
      ]),
  },
])
async function fetchTemplates(next = page.value) {
  loading.value = true
  try {
    const result = await listWecomTemplates(auth.token, next)
    templates.value = result.items
    page.value = result.meta.currentPage
    pageCount.value = result.meta.lastPage
  } catch (e) {
    toast.error(e instanceof Error ? e.message : t('wecom_templates.fetch_failed'))
  } finally {
    loading.value = false
  }
}
function edit(template: WecomMessageTemplate) {
  editing.value = template
  show()
}
function create() {
  editing.value = null
  show()
}
function requestDelete(template: WecomMessageTemplate) {
  pending.value = template
  deleteOpen.value = true
}
async function copyCurl(template: WecomMessageTemplate) {
  try {
    await copyText(buildWecomTemplateCurl(template))
    toast.success(t('wecom_templates.curl_copied'))
  } catch {
    toast.error(t('wecom_templates.curl_copy_failed'))
  }
}
async function save(input: WecomTemplateInput) {
  saving.value = true
  try {
    if (editing.value) await updateWecomTemplate(auth.token, editing.value.id, input)
    else await createWecomTemplate(auth.token, input)
    close()
    await fetchTemplates()
    toast.success(t('wecom_templates.save_success'))
  } catch (e) {
    toast.error(e instanceof Error ? e.message : t('wecom_templates.save_failed'))
  } finally {
    saving.value = false
  }
}
async function confirmDelete() {
  if (!pending.value) return
  deleting.value = true
  try {
    await deleteWecomTemplate(auth.token, pending.value.id)
    deleteOpen.value = false
    pending.value = null
    await fetchTemplates()
    toast.success(t('wecom_templates.delete_success'))
  } catch (e) {
    toast.error(e instanceof Error ? e.message : t('wecom_templates.delete_failed'))
  } finally {
    deleting.value = false
  }
}
onMounted(() => void fetchTemplates())
watch(page, (value) => void fetchTemplates(value))
</script>
<template>
  <ListPage
    :title="t('wecom_templates.title')"
    :description="t('wecom_templates.desc')"
    :loading="loading"
    :refresh-label="t('common.refresh')"
    :action-label="t('wecom_templates.create')"
    :show-action="can('wecom-templates:create')"
    @refresh="fetchTemplates()"
    @action="create"
    ><template #refresh-icon
      ><RefreshCw class="size-4" :class="{ 'animate-spin': loading }" /></template
    ><template #action-icon><Plus class="size-4" /></template
    ><DataTable
      :columns="columns"
      :data="templates"
      :search-keys="['name', 'msgtype']"
      :search-placeholder="t('wecom_templates.search')"
      storage-key="wecom-message-templates-table"
      :empty-message="loading ? t('common.loading') : t('wecom_templates.empty')"
      :server-pagination="{ page, pageCount }"
      @page-change="page = $event" /><template #dialogs
      ><Dialog v-if="mounted" :open="open" @update:open="onOpenChange"
        ><FormDialogContent
          :title="editing ? t('wecom_templates.edit') : t('wecom_templates.create')"
          :description="t('wecom_templates.form_desc')"
          class="sm:max-w-6xl"
          ><WecomMessageTemplateForm
            :open="open"
            :template="editing"
            :saving="saving"
            @save="save"
            @cancel="close" /></FormDialogContent></Dialog
      ><Dialog :open="testOpen" @update:open="testOpen = $event"
        ><FormDialogContent
          :title="t('wecom_templates.test_title')"
          :description="t('wecom_templates.test_desc')"
          ><div class="space-y-5 px-6 pb-6">
            <div class="space-y-2">
              <label for="wecom-test-params" class="text-sm font-medium">{{
                t('wecom_templates.test_params')
              }}</label>
              <p v-if="!testParameters.length" class="text-sm text-muted-foreground">
                {{ t('wecom_templates.no_parameters') }}
              </p>
              <div class="h-56 overflow-hidden rounded-md border bg-card">
                <CodeEditor v-model="testParamsText" :extensions="[json()]" />
              </div>
              <p
                v-if="testParamsText.trim() && !testParamsSyntaxValid"
                class="text-sm text-destructive"
              >
                {{ t('wecom_templates.validation.json') }}
              </p>
            </div>
            <div v-if="testTemplate?.msgtype === 'text'" class="space-y-3">
              <label for="wecom-test-mentioned" class="text-sm font-medium">{{
                t('wecom_templates.mentioned_list')
              }}</label
              ><TagsInput id="wecom-test-mentioned" v-model="mentionedList" class="min-h-10"
                ><TagsInputItem v-for="item in mentionedList" :key="item" :value="item"
                  ><TagsInputItemText /><TagsInputItemDelete /></TagsInputItem
                ><TagsInputInput :placeholder="t('wecom_templates.mentioned_placeholder')"
              /></TagsInput>
            </div>
            <div v-if="testTemplate?.msgtype === 'text'" class="space-y-3">
              <label for="wecom-test-mentioned-mobile" class="text-sm font-medium">{{
                t('wecom_templates.mentioned_mobile_list')
              }}</label
              ><TagsInput
                id="wecom-test-mentioned-mobile"
                v-model="mentionedMobileList"
                class="min-h-10"
                ><TagsInputItem v-for="item in mentionedMobileList" :key="item" :value="item"
                  ><TagsInputItemText /><TagsInputItemDelete /></TagsInputItem
                ><TagsInputInput :placeholder="t('wecom_templates.mentioned_mobile_placeholder')"
              /></TagsInput>
            </div>
          </div>
          <FormDialogFooter class="justify-end"
            ><Button variant="outline" :disabled="testing" @click="testOpen = false">{{
              t('common.cancel')
            }}</Button
            ><Button :disabled="testing" @click="confirmTest">{{
              testing ? t('common.testing') : t('wecom_templates.test')
            }}</Button></FormDialogFooter
          ></FormDialogContent
        ></Dialog
      ><Dialog :open="testConfirmOpen" @update:open="testConfirmOpen = $event"
        ><FormDialogContent
          :title="t('wecom_templates.test_confirm_title')"
          :description="t('wecom_templates.test_confirm_desc')"
          ><div class="px-6 pb-6">
            <pre
              class="max-h-96 overflow-auto rounded-md border bg-muted/20 p-4 font-mono text-xs"
              >{{ renderedTestPayload }}</pre
            >
          </div>
          <FormDialogFooter class="justify-end"
            ><Button variant="outline" :disabled="testing" @click="testConfirmOpen = false">{{
              t('common.cancel')
            }}</Button
            ><Button :disabled="testing" @click="sendConfirmedTest">{{
              testing ? t('common.testing') : t('wecom_templates.confirm_test')
            }}</Button></FormDialogFooter
          ></FormDialogContent
        ></Dialog
      ><ConfirmDialog
        v-model:open="deleteOpen"
        :title="t('wecom_templates.delete_title')"
        :description="t('wecom_templates.delete_desc')"
        :loading="deleting"
        :confirm-label="t('common.delete')"
        @confirm="confirmDelete" /></template
  ></ListPage>
</template>
