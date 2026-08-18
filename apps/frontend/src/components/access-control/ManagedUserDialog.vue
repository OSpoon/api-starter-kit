<script setup lang="ts">
import { KeyRound } from '@lucide/vue'

import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SystemRoleOption, SystemUser } from '@/features/access-control/api'

const props = defineProps<{
  user: SystemUser | null
  roles: SystemRoleOption[]
  saving: boolean
  currentUserId?: number
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  save: [payload: { fullName: string; email: string; roleIds: number[] }]
  resetPassword: []
}>()
const { t } = useI18n()
const form = ref({ fullName: '', email: '', roleIds: [] as number[] })

const isSuperAdmin = computed(
  () => props.user?.roles.some((role) => role.code === 'super-admin') ?? false
)
const editableRoles = computed(() =>
  isSuperAdmin.value
    ? props.roles.filter((role) => role.code === 'super-admin')
    : props.roles.filter((role) => role.code !== 'super-admin')
)

watch(
  () => [open.value, props.user] as const,
  ([isOpen, user]) => {
    if (!isOpen) return
    form.value = {
      fullName: user?.fullName ?? '',
      email: user?.email ?? '',
      roleIds: user?.roles.map((role) => role.id) ?? [],
    }
  },
  { immediate: true }
)

function toggleRole(roleId: number, checked: boolean) {
  form.value.roleIds = checked
    ? [...new Set([...form.value.roleIds, roleId])]
    : form.value.roleIds.filter((id) => id !== roleId)
}

function submit() {
  emit('save', { ...form.value })
}
</script>

<template>
  <FormDialogContent
    :title="user ? t('rbac.users.edit') : t('rbac.users.create')"
    :description="user ? t('rbac.users.form_desc') : t('rbac.users.create_desc')"
    class="sm:max-w-130"
  >
    <form @submit.prevent="submit">
      <div class="grid gap-4 px-6 pb-6">
        <div class="grid gap-2">
          <Label for="managed-user-full-name">{{ t('rbac.users.name') }}</Label>
          <Input
            id="managed-user-full-name"
            v-model="form.fullName"
            :placeholder="t('rbac.users.name')"
          />
        </div>
        <div class="grid gap-2">
          <Label for="managed-user-email">{{ t('auth.email') }}</Label>
          <Input
            id="managed-user-email"
            v-model="form.email"
            type="email"
            :placeholder="t('auth.email')"
          />
        </div>
        <div class="grid gap-2">
          <p class="text-sm font-medium">{{ t('rbac.users.assign_roles') }}</p>
          <div class="space-y-3">
            <label
              v-for="role in editableRoles"
              :key="role.id"
              class="flex items-center gap-3 rounded-md border p-3"
              :class="{ 'cursor-pointer': !isSuperAdmin }"
            >
              <Checkbox
                :model-value="form.roleIds.includes(role.id)"
                :disabled="isSuperAdmin"
                @update:model-value="toggleRole(role.id, Boolean($event))"
              />
              <span>
                <span class="block text-sm font-medium">{{ role.name }}</span>
                <span class="block text-xs text-muted-foreground">{{ role.code }}</span>
              </span>
            </label>
          </div>
        </div>
      </div>
      <FormDialogFooter>
        <template #start>
          <Button
            v-if="user && currentUserId !== user.id"
            type="button"
            variant="outline"
            :disabled="saving"
            @click="emit('resetPassword')"
          >
            <KeyRound class="size-4" />
            {{ t('rbac.users.reset_password') }}
          </Button>
        </template>
        <Button type="button" variant="outline" @click="open = false">{{
          t('common.cancel')
        }}</Button>
        <Button type="submit" :disabled="saving || !form.fullName.trim() || !form.email.trim()">
          {{ t('common.save') }}
        </Button>
      </FormDialogFooter>
    </form>
  </FormDialogContent>
</template>
