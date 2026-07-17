<script setup lang="ts">
import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { SystemPermission } from '@/lib/rbac-api'

const props = defineProps<{ permission: SystemPermission | null; saving: boolean }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  save: [payload: { code: string; name: string; groupName: string; description: string }]
}>()
const { t } = useI18n()
const form = ref({ code: '', name: '', groupName: '', description: '' })

watch(
  () => [open.value, props.permission] as const,
  ([isOpen, permission]) => {
    if (!isOpen) return
    form.value = {
      code: permission?.code ?? '',
      name: permission?.name ?? '',
      groupName: permission?.groupName ?? '',
      description: permission?.description ?? '',
    }
  },
  { immediate: true }
)
</script>

<template>
  <FormDialogContent
    :title="permission ? t('rbac.permissions.edit') : t('rbac.permissions.create')"
    :description="t('rbac.permissions.form_desc')"
  >
    <form @submit.prevent="emit('save', { ...form })">
      <div class="grid gap-4 px-6 pb-6">
        <div v-if="!permission" class="grid gap-2">
          <Label for="permission-code">{{ t('rbac.permissions.code') }}</Label>
          <Input id="permission-code" v-model="form.code" placeholder="resource:action" />
        </div>
        <div class="grid gap-2">
          <Label for="permission-name">{{ t('rbac.permissions.name') }}</Label>
          <Input
            id="permission-name"
            v-model="form.name"
            :placeholder="t('rbac.permissions.name')"
          />
        </div>
        <div class="grid gap-2">
          <Label for="permission-group">{{ t('rbac.permissions.group') }}</Label>
          <Input
            id="permission-group"
            v-model="form.groupName"
            :placeholder="t('rbac.permissions.group')"
          />
        </div>
        <div class="grid gap-2">
          <Label for="permission-description">{{ t('rbac.permissions.description') }}</Label>
          <Textarea
            id="permission-description"
            v-model="form.description"
            :placeholder="t('rbac.permissions.description')"
          />
        </div>
      </div>
      <FormDialogFooter class="justify-end">
        <Button type="button" variant="outline" @click="open = false">{{
          t('common.cancel')
        }}</Button>
        <Button
          type="submit"
          :disabled="
            saving ||
            !form.name.trim() ||
            !form.groupName.trim() ||
            (!permission && !form.code.trim())
          "
        >
          {{ t('common.save') }}
        </Button>
      </FormDialogFooter>
    </form>
  </FormDialogContent>
</template>
