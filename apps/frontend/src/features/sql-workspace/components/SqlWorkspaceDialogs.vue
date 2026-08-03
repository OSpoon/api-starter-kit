<script setup lang="ts">
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const props = defineProps<{
  closeOpen: boolean
  loading: boolean
  remoteUrl: string
  remoteUrlOpen: boolean
  replaceOpen: boolean
  saveOpen: boolean
}>()
const emit = defineEmits<{
  close: []
  'update:closeOpen': [value: boolean]
  'update:remoteUrl': [value: string]
  'update:remoteUrlOpen': [value: boolean]
  'update:replaceOpen': [value: boolean]
  'update:saveOpen': [value: boolean]
  replace: []
  save: []
  submitUrl: []
}>()
const { t } = useI18n()

function updateRemoteUrl(value: string | number) {
  emit('update:remoteUrl', String(value))
}
</script>

<template>
  <ConfirmDialog :open="props.replaceOpen" :title="t('sql_workspace.replace_title')" :description="t('sql_workspace.replace_description')" :confirm-label="t('sql_workspace.replace_confirm')" @update:open="emit('update:replaceOpen', $event)" @confirm="emit('replace')" />
  <ConfirmDialog :open="props.closeOpen" :title="t('sql_workspace.close_workspace_title')" :description="t('sql_workspace.close_workspace_description')" :confirm-label="t('sql_workspace.close_workspace_confirm')" @update:open="emit('update:closeOpen', $event)" @confirm="emit('close')" />
  <Dialog :open="props.remoteUrlOpen" @update:open="emit('update:remoteUrlOpen', $event)">
    <DialogContent>
      <DialogHeader><DialogTitle>{{ t('sql_workspace.open_url') }}</DialogTitle><DialogDescription>{{ t('sql_workspace.open_url_description') }}</DialogDescription></DialogHeader>
      <label class="grid gap-2 text-sm font-medium" for="sql-workspace-remote-url">
        {{ t('sql_workspace.url_label') }}
        <Input id="sql-workspace-remote-url" :model-value="props.remoteUrl" type="url" placeholder="https://example.cos.ap-.../script.sql" @update:model-value="updateRemoteUrl" @keydown.enter="emit('submitUrl')" />
      </label>
      <DialogFooter><Button variant="outline" @click="emit('update:remoteUrlOpen', false)">{{ t('common.cancel') }}</Button><Button :disabled="!props.remoteUrl.trim() || props.loading" @click="emit('submitUrl')">{{ t('sql_workspace.open') }}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
  <ConfirmDialog :open="props.saveOpen" :title="t('sql_workspace.save_workspace_title')" :description="t('sql_workspace.save_workspace_description')" :confirm-label="t('sql_workspace.save_confirm')" @update:open="emit('update:saveOpen', $event)" @confirm="emit('save')" />
</template>
