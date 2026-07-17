<script setup lang="ts">
import { Copy, Plus, RefreshCw } from '@lucide/vue'
import { proxyRefs } from 'vue'

import ManagedUserDialog from '@/components/access-control/ManagedUserDialog.vue'
import PermissionDialog from '@/components/access-control/PermissionDialog.vue'
import RoleDialog from '@/components/access-control/RoleDialog.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import DataTable from '@/components/common/DataTable.vue'
import ListPage from '@/components/common/ListPage.vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAccessControlColumns } from '@/composables/useAccessControlColumns'
import {
  type AccessControlMode,
  useAccessControlManagement,
} from '@/composables/useAccessControlManagement'
import { usePermission } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ mode: AccessControlMode }>()
const auth = useAuthStore()
const { can } = usePermission()
const { t } = useI18n()
const mode = toRef(props, 'mode')
const management = proxyRefs(useAccessControlManagement(mode))
const currentUserId = computed(() => auth.user?.id)
const title = computed(() => t(`rbac.${props.mode}.title`))
const description = computed(() => t(`rbac.${props.mode}.desc`))
const canCreate = computed(() =>
  props.mode === 'users'
    ? can('users:create')
    : props.mode === 'roles'
      ? can('roles:create')
      : can('permissions:create')
)
const actionLabel = computed(() => t(`rbac.${props.mode}.create`))

const { userColumns, roleColumns, permissionColumns } = useAccessControlColumns({
  currentUserId,
  editUser: management.openUser,
  deleteUser: (user) => {
    management.selectedUser = user
    management.deleteUserDialogOpen = true
  },
  editRole: management.openRole,
  deleteRole: (role) => {
    management.selectedRole = role
    management.deleteRoleDialogOpen = true
  },
  copyPermission: management.copyPermissionCode,
  editPermission: management.openPermission,
  deletePermission: (permission) => {
    management.selectedPermission = permission
    management.deletePermissionDialogOpen = true
  },
})
</script>

<template>
  <ListPage
    :title="title"
    :description="description"
    :loading="management.loading"
    :refresh-label="t('common.refresh')"
    :action-label="actionLabel"
    :show-action="canCreate"
    @refresh="management.load"
    @action="management.openCreate"
  >
    <template #refresh-icon
      ><RefreshCw class="size-4" :class="{ 'animate-spin': management.loading }"
    /></template>
    <template #action-icon><Plus class="size-4" /></template>

    <DataTable
      v-if="mode === 'users'"
      v-model:search="management.search"
      :columns="userColumns"
      :data="management.users"
      :search-keys="['fullName', 'email']"
      :search-placeholder="t('common.search_placeholder')"
      storage-key="rbac-users-table"
      :empty-message="management.loading ? t('common.loading') : t('common.no_data')"
      :server-pagination="{ page: management.page, pageCount: management.pageCount }"
      @page-change="management.page = $event"
    />
    <DataTable
      v-else-if="mode === 'roles'"
      v-model:search="management.search"
      :columns="roleColumns"
      :data="management.roles"
      :search-keys="['name', 'code', 'description']"
      :search-placeholder="t('common.search_placeholder')"
      storage-key="rbac-roles-table"
      :empty-message="management.loading ? t('common.loading') : t('common.no_data')"
      :server-pagination="{ page: management.page, pageCount: management.pageCount }"
      @page-change="management.page = $event"
    />
    <DataTable
      v-else
      v-model:search="management.search"
      :columns="permissionColumns"
      :data="management.permissions"
      :search-keys="['name', 'code', 'groupName', 'description']"
      :search-placeholder="t('common.search_placeholder')"
      storage-key="rbac-permissions-table"
      filters-layout="inline"
      :empty-message="management.loading ? t('common.loading') : t('common.no_data')"
      :server-pagination="{ page: management.page, pageCount: management.pageCount }"
      @page-change="management.page = $event"
    >
      <template #filters>
        <Select v-model="management.permissionGroupFilter">
          <SelectTrigger class="w-44"
            ><SelectValue :placeholder="t('rbac.permissions.group')"
          /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{{ t('rbac.permissions.all_groups') }}</SelectItem>
            <SelectItem v-for="group in management.permissionGroups" :key="group" :value="group">{{
              group
            }}</SelectItem>
          </SelectContent>
        </Select>
      </template>
    </DataTable>

    <template #dialogs>
      <Dialog v-model:open="management.userDialogOpen">
        <ManagedUserDialog
          v-model:open="management.userDialogOpen"
          :user="management.selectedUser"
          :roles="management.roleCatalog"
          :saving="management.saving"
          :current-user-id="currentUserId"
          @save="management.saveUser"
          @reset-password="management.resetPasswordDialogOpen = true"
        />
      </Dialog>
      <Dialog v-model:open="management.roleDialogOpen">
        <RoleDialog
          v-model:open="management.roleDialogOpen"
          :role="management.selectedRole"
          :permissions="management.permissionCatalog"
          :saving="management.saving"
          @save="management.saveRole"
        />
      </Dialog>
      <Dialog v-model:open="management.permissionDialogOpen">
        <PermissionDialog
          v-model:open="management.permissionDialogOpen"
          :permission="management.selectedPermission"
          :saving="management.saving"
          @save="management.savePermission"
        />
      </Dialog>
      <Dialog v-model:open="management.initialPasswordDialogOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{{ t('rbac.users.initial_password') }}</DialogTitle>
            <DialogDescription>{{ t('rbac.users.initial_password_desc') }}</DialogDescription>
          </DialogHeader>
          <div class="flex items-center gap-2 rounded-md border bg-muted p-3">
            <code class="min-w-0 flex-1 overflow-x-auto text-sm">{{
              management.createdInitialPassword
            }}</code>
            <Button
              variant="secondary"
              size="icon"
              :title="t('common.copy')"
              :aria-label="t('common.copy')"
              @click="management.copyInitialPassword"
              ><Copy class="size-4"
            /></Button>
          </div>
          <DialogFooter
            ><Button @click="management.initialPasswordDialogOpen = false">{{
              t('common.confirm')
            }}</Button></DialogFooter
          >
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        v-model:open="management.deleteRoleDialogOpen"
        :title="t('rbac.roles.delete_title')"
        :description="t('rbac.roles.delete_desc')"
        :confirm-label="t('common.delete')"
        :loading="management.saving"
        @confirm="management.removeRole"
      />
      <ConfirmDialog
        v-model:open="management.deleteUserDialogOpen"
        :title="t('rbac.users.delete_title')"
        :description="t('rbac.users.delete_desc')"
        :confirm-label="t('common.delete')"
        :loading="management.saving"
        @confirm="management.removeUser"
      />
      <ConfirmDialog
        v-model:open="management.deletePermissionDialogOpen"
        :title="t('rbac.permissions.delete_title')"
        :description="t('rbac.permissions.delete_desc')"
        :confirm-label="t('common.delete')"
        :loading="management.saving"
        @confirm="management.removePermission"
      />
      <ConfirmDialog
        v-model:open="management.resetPasswordDialogOpen"
        :title="t('rbac.users.reset_password')"
        :description="t('rbac.users.reset_password_confirm')"
        :confirm-label="t('rbac.users.reset_password')"
        :loading="management.saving"
        @confirm="management.resetUserPassword"
      />
    </template>
  </ListPage>
</template>
