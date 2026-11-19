<script setup lang="ts">
import { Check, Copy } from '@lucide/vue'
import { proxyRefs } from 'vue'

import ManagedUserDialog from '@/components/access-control/ManagedUserDialog.vue'
import RoleDialog from '@/components/access-control/RoleDialog.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import DataTable from '@/components/common/DataTable.vue'
import DataTableFacetFilter from '@/components/common/DataTableFacetFilter.vue'
import DataTableTextFilter from '@/components/common/DataTableTextFilter.vue'
import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import ListPage from '@/components/common/ListPage.vue'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
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
const initialPasswordText = ref<HTMLElement | null>(null)
const { t } = useI18n()
const mode = toRef(props, 'mode')
const management = proxyRefs(useAccessControlManagement(mode))
const currentUserId = computed(() => auth.user?.id)
const title = computed(() => t(`rbac.${props.mode}.title`))
const canCreate = computed(() => {
  if (props.mode === 'users') return can('users:create')
  if (props.mode === 'roles') return can('roles:create')
  return false
})
const actionLabel = computed(() =>
  props.mode === 'permissions' ? '' : t(`rbac.${props.mode}.create`)
)
const permissionGroupFilterOptions = computed(() =>
  management.permissionGroups.map((groupName) => ({ value: groupName, label: groupName }))
)

function resetFilters() {
  if (mode.value === 'users') {
    management.userNameFilter = ''
    management.userEmailFilter = ''
    management.roleFilter = []
    management.channelFilter = []
  }
  if (mode.value === 'roles') {
    management.roleCodeFilter = ''
    management.roleNameFilter = ''
    management.roleDescriptionFilter = ''
  }
  if (mode.value === 'permissions') {
    management.permissionCodeFilter = ''
    management.permissionNameFilter = ''
    management.permissionDescriptionFilter = ''
    management.permissionGroupFilter = []
  }
  management.applyFilters()
}

const { userColumns, roleColumns, permissionColumns } = useAccessControlColumns({
  currentUserId,
  permissionCatalog: computed(() => management.permissionCatalog),
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
})
</script>

<template>
  <ListPage
    :title="title"
    :loading="management.loading"
    :action-label="actionLabel"
    :show-action="canCreate"
    @action="management.openCreate"
  >
    <DataTable
      v-if="mode === 'users'"
      @reset="resetFilters"
      @search="management.applyFilters"
      :columns="userColumns"
      :data="management.users"
      storage-key="rbac-users-table"
      :empty-message="management.loading ? t('common.loading') : t('common.no_data')"
      :server-pagination="{ page: management.page, pageCount: management.pageCount }"
      @page-change="management.page = $event"
    >
      <template #filters>
        <DataTableTextFilter
          id="rbac-user-name-filter"
          v-model="management.userNameFilter"
          :label="t('rbac.users.name')"
          :placeholder="t('rbac.users.filter_name')"
        />
        <DataTableTextFilter
          id="rbac-user-email-filter"
          v-model="management.userEmailFilter"
          :label="t('auth.email')"
          :placeholder="t('rbac.users.filter_email')"
        />
        <DataTableFacetFilter
          v-model="management.roleFilter"
          :label="t('rbac.users.roles')"
          :options="management.roleFilterOptions"
        />
        <DataTableFacetFilter
          v-model="management.channelFilter"
          :label="t('rbac.users.channels_title')"
          :options="management.channelFilterOptions"
        />
      </template>
    </DataTable>
    <DataTable
      v-else-if="mode === 'roles'"
      @reset="resetFilters"
      @search="management.applyFilters"
      :columns="roleColumns"
      :data="management.roles"
      storage-key="rbac-roles-table"
      :empty-message="management.loading ? t('common.loading') : t('common.no_data')"
      :server-pagination="{ page: management.page, pageCount: management.pageCount }"
      @page-change="management.page = $event"
    >
      <template #filters>
        <DataTableTextFilter
          id="rbac-role-code-filter"
          v-model="management.roleCodeFilter"
          :label="t('rbac.roles.code')"
          :placeholder="t('rbac.roles.filter_code')"
        />
        <DataTableTextFilter
          id="rbac-role-name-filter"
          v-model="management.roleNameFilter"
          :label="t('rbac.roles.name')"
          :placeholder="t('rbac.roles.filter_name')"
        />
        <DataTableTextFilter
          id="rbac-role-description-filter"
          v-model="management.roleDescriptionFilter"
          :label="t('rbac.roles.description')"
          :placeholder="t('rbac.roles.filter_description')"
        />
      </template>
    </DataTable>
    <DataTable
      v-else
      @reset="resetFilters"
      @search="management.applyFilters"
      :columns="permissionColumns"
      :data="management.permissions"
      storage-key="rbac-permissions-table"
      :empty-message="management.loading ? t('common.loading') : t('common.no_data')"
      :server-pagination="{ page: management.page, pageCount: management.pageCount }"
      @page-change="management.page = $event"
    >
      <template #filters>
        <DataTableTextFilter
          id="permission-code-filter"
          v-model="management.permissionCodeFilter"
          :label="t('rbac.permissions.code')"
          :placeholder="t('rbac.permissions.filter_code')"
        />
        <DataTableTextFilter
          id="permission-name-filter"
          v-model="management.permissionNameFilter"
          :label="t('rbac.permissions.name')"
          :placeholder="t('rbac.permissions.filter_name')"
        />
        <DataTableTextFilter
          id="permission-description-filter"
          v-model="management.permissionDescriptionFilter"
          :label="t('rbac.permissions.description')"
          :placeholder="t('rbac.permissions.filter_description')"
        />
        <DataTableFacetFilter
          v-model="management.permissionGroupFilter"
          :label="t('rbac.permissions.group')"
          :options="permissionGroupFilterOptions"
        />
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
      <Dialog v-model:open="management.initialPasswordDialogOpen">
        <FormDialogContent
          :title="t('rbac.users.initial_password')"
          :description="t('rbac.users.initial_password_desc')"
          class="sm:max-w-155"
        >
          <div class="px-6 pb-6">
            <div class="flex items-center gap-2 overflow-x-auto rounded-md border bg-muted p-3">
              <p
                ref="initialPasswordText"
                class="shrink-0 font-mono text-sm/snug whitespace-nowrap"
              >
                {{ management.createdInitialPassword }}
              </p>
              <Button
                size="sm"
                variant="secondary"
                class="ml-auto shrink-0"
                :title="management.initialPasswordCopied ? t('common.copied') : t('common.copy')"
                :aria-label="
                  management.initialPasswordCopied ? t('common.copied') : t('common.copy')
                "
                @click="management.copyInitialPassword(initialPasswordText)"
              >
                <Check v-if="management.initialPasswordCopied" class="mr-1 size-4 text-chart-3" />
                <Copy v-else class="mr-1 size-4" />
                {{ management.initialPasswordCopied ? t('common.copied') : t('common.copy') }}
              </Button>
            </div>
          </div>
          <FormDialogFooter class="justify-end">
            <Button @click="management.initialPasswordDialogOpen = false">
              {{ t('common.done') }}
            </Button>
          </FormDialogFooter>
        </FormDialogContent>
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
