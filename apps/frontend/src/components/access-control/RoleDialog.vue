<script setup lang="ts">
import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import PermissionTransfer from '@/components/common/PermissionTransfer.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { SystemPermissionOption, SystemRole } from '@/lib/rbac-api'

const props = defineProps<{
  role: SystemRole | null
  permissions: SystemPermissionOption[]
  saving: boolean
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  save: [payload: { code: string; name: string; description: string; permissionIds: number[] }]
}>()
const { t } = useI18n()
const form = ref({ code: '', name: '', description: '', permissionIds: [] as number[] })

watch(
  () => [open.value, props.role] as const,
  ([isOpen, role]) => {
    if (!isOpen) return
    form.value = {
      code: role?.code ?? '',
      name: role?.name ?? '',
      description: role?.description ?? '',
      permissionIds: role?.permissionIds ?? [],
    }
  },
  { immediate: true }
)
</script>

<template>
  <FormDialogContent
    :title="role ? t('rbac.roles.edit') : t('rbac.roles.create')"
    :description="t('rbac.roles.form_desc')"
    class="sm:max-w-225"
  >
    <form
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
      @submit.prevent="emit('save', { ...form })"
    >
      <div class="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 pb-6">
        <div v-if="!role" class="grid gap-2">
          <Label for="role-code">{{ t('rbac.roles.code') }}</Label>
          <Input id="role-code" v-model="form.code" placeholder="role-code" />
        </div>
        <div class="grid gap-2">
          <Label for="role-name">{{ t('rbac.roles.name') }}</Label>
          <Input id="role-name" v-model="form.name" :placeholder="t('rbac.roles.name')" />
        </div>
        <div class="grid gap-2">
          <Label for="role-description">{{ t('rbac.roles.description') }}</Label>
          <Textarea
            id="role-description"
            v-model="form.description"
            :placeholder="t('rbac.roles.description')"
          />
        </div>
        <div class="grid gap-2">
          <p class="text-sm font-medium">{{ t('rbac.roles.permissions') }}</p>
          <PermissionTransfer v-model="form.permissionIds" :permissions="permissions" />
        </div>
      </div>
      <FormDialogFooter class="shrink-0 justify-end">
        <Button type="button" variant="outline" @click="open = false">{{
          t('common.cancel')
        }}</Button>
        <Button
          type="submit"
          :disabled="saving || !form.name.trim() || (!role && !form.code.trim())"
        >
          {{ t('common.save') }}
        </Button>
      </FormDialogFooter>
    </form>
  </FormDialogContent>
</template>
