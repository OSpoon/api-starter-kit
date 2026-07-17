<script setup lang="ts">
import {
  ChevronRight,
  Copy,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { toast } from 'vue-sonner'

import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import DataTable from '@/components/common/DataTable.vue'
import FormDialogContent from '@/components/common/FormDialogContent.vue'
import FormDialogFooter from '@/components/common/FormDialogFooter.vue'
import ListPage from '@/components/common/ListPage.vue'
import PermissionTransfer from '@/components/common/PermissionTransfer.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { copyText } from '@/lib/clipboard'
import { usePermission } from '@/lib/permission'
import {
  createSystemPermission,
  createSystemRole,
  createSystemUser,
  deleteSystemPermission,
  deleteSystemRole,
  deleteSystemUser,
  listSystemPermissionCatalog,
  listSystemPermissions,
  listSystemRoleCatalog,
  listSystemRoles,
  listSystemUsers,
  resetSystemUserPassword,
  type SystemPermission,
  type SystemPermissionOption,
  type SystemRole,
  type SystemRoleOption,
  type SystemUser,
  updateSystemPermission,
  updateSystemRole,
  updateSystemUser,
} from '@/lib/rbac-api'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ mode: 'users' | 'roles' | 'permissions' }>()
const auth = useAuthStore()
const { can } = usePermission()
const { t } = useI18n()

const users = ref<SystemUser[]>([])
const roles = ref<SystemRole[]>([])
const permissions = ref<SystemPermission[]>([])
const roleCatalog = ref<SystemRoleOption[]>([])
const permissionCatalog = ref<SystemPermissionOption[]>([])
const permissionGroupFilter = ref('__all__')
const loading = ref(false)
const page = ref(1)
const pageCount = ref(1)
const saving = ref(false)
const userDialogOpen = ref(false)
const initialPasswordDialogOpen = ref(false)
const resetPasswordDialogOpen = ref(false)
const roleDialogOpen = ref(false)
const permissionDialogOpen = ref(false)
const deleteDialogOpen = ref(false)
const deleteUserDialogOpen = ref(false)
const deletePermissionDialogOpen = ref(false)
const selectedUser = ref<SystemUser | null>(null)
const selectedRole = ref<SystemRole | null>(null)
const selectedPermission = ref<SystemPermission | null>(null)
const userForm = ref({ fullName: '', email: '', roleIds: [] as number[] })
const roleForm = ref({ code: '', name: '', description: '', permissionIds: [] as number[] })
const permissionForm = ref({ code: '', name: '', groupName: '', description: '' })
const createdInitialPassword = ref('')

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
const selectedUserIsSuperAdmin = computed(
  () => selectedUser.value?.roles?.some((role) => role.code === 'super-admin') ?? false
)
const editableUserRoles = computed(() =>
  selectedUserIsSuperAdmin.value
    ? roleCatalog.value.filter((role) => role.code === 'super-admin')
    : roleCatalog.value.filter((role) => role.code !== 'super-admin')
)
const permissionGroups = computed(() =>
  [...new Set(permissions.value.map((permission) => permission.groupName))].sort()
)
const filteredPermissions = computed(() =>
  permissionGroupFilter.value === '__all__'
    ? permissions.value
    : permissions.value.filter((permission) => permission.groupName === permissionGroupFilter.value)
)

function getPermissionHierarchy(permission: SystemPermission) {
  const [resource, action] = permission.code.split(':')
  return { resource: resource ?? permission.code, action: action ?? permission.code }
}

const userColumns = computed<ColumnDef<SystemUser>[]>(() => [
  {
    accessorKey: 'fullName',
    meta: { label: t('rbac.users.name') },
    header: () => t('rbac.users.name'),
    cell: ({ row }) =>
      h('div', [
        h('p', { class: 'font-medium' }, row.original.fullName || row.original.email),
        h('p', { class: 'text-xs text-muted-foreground' }, row.original.email),
      ]),
  },
  {
    id: 'roles',
    meta: { label: t('rbac.users.roles') },
    header: () => t('rbac.users.roles'),
    cell: ({ row }) =>
      h(
        'div',
        { class: 'flex flex-wrap gap-1' },
        row.original.roles.map((role) => h(Badge, { variant: 'secondary' }, () => role.name))
      ),
  },
  {
    id: 'security',
    meta: { label: t('rbac.users.security') },
    header: () => t('rbac.users.security'),
    cell: ({ row }) =>
      h(Badge, { variant: 'outline' }, () =>
        row.original.twoFactorEnabled ? '2FA' : t('rbac.users.password_only')
      ),
  },
  {
    id: 'actions',
    enableHiding: false,
    meta: { label: t('common.actions') },
    header: () => h('div', { class: 'text-right' }, t('common.actions')),
    cell: ({ row }) =>
      h('div', { class: 'flex justify-end gap-1' }, [
        can('users:update')
          ? h(
              Button,
              {
                variant: 'ghost',
                size: 'icon',
                title: t('common.edit'),
                'aria-label': t('common.edit'),
                onClick: (event: Event) => {
                  event.stopPropagation()
                  openUser(row.original)
                },
              },
              () => h(Pencil, { class: 'size-4' })
            )
          : null,
        can('users:delete') && auth.user?.id !== row.original.id
          ? h(
              Button,
              {
                variant: 'ghost',
                size: 'icon',
                class: 'text-destructive',
                title: t('common.delete'),
                'aria-label': t('common.delete'),
                onClick: (event: Event) => {
                  event.stopPropagation()
                  selectedUser.value = row.original
                  deleteUserDialogOpen.value = true
                },
              },
              () => h(Trash2, { class: 'size-4' })
            )
          : null,
      ]),
  },
])

const roleColumns = computed<ColumnDef<SystemRole>[]>(() => [
  {
    accessorKey: 'name',
    meta: { label: t('rbac.roles.name') },
    header: () => t('rbac.roles.name'),
    cell: ({ row }) =>
      h('div', [
        h('div', { class: 'flex items-center gap-2 font-medium' }, [
          row.original.name,
          row.original.isSystem ? h(Badge, { variant: 'secondary' }, () => t('rbac.system')) : null,
        ]),
        h('p', { class: 'font-mono text-xs text-muted-foreground' }, row.original.code),
      ]),
  },
  {
    accessorKey: 'description',
    meta: { label: t('rbac.roles.description') },
    header: () => t('rbac.roles.description'),
    cell: ({ row }) => row.original.description || t('rbac.no_description'),
  },
  {
    accessorKey: 'userCount',
    meta: { label: t('rbac.roles.user_count') },
    header: () => t('rbac.roles.user_count'),
    cell: ({ row }) => row.original.userCount,
  },
  {
    accessorKey: 'permissionIds',
    meta: { label: t('rbac.roles.permission_count') },
    header: () => t('rbac.roles.permissions'),
    cell: ({ row }) =>
      t('rbac.roles.permission_count', { count: row.original.permissionIds.length }),
  },
  {
    id: 'actions',
    enableHiding: false,
    meta: { label: t('common.actions') },
    header: () => h('div', { class: 'text-right' }, t('common.actions')),
    cell: ({ row }) =>
      !row.original.isSystem
        ? h('div', { class: 'flex justify-end gap-1' }, [
            can('roles:update')
              ? h(
                  Button,
                  {
                    variant: 'ghost',
                    size: 'icon',
                    title: t('common.edit'),
                    'aria-label': t('common.edit'),
                    onClick: (event: Event) => {
                      event.stopPropagation()
                      openRole(row.original)
                    },
                  },
                  () => h(Pencil, { class: 'size-4' })
                )
              : null,
            can('roles:delete')
              ? h(
                  Button,
                  {
                    variant: 'ghost',
                    size: 'icon',
                    class: 'text-destructive',
                    disabled: row.original.userCount > 0,
                    title: t('common.delete'),
                    'aria-label': t('common.delete'),
                    onClick: (event: Event) => {
                      event.stopPropagation()
                      selectedRole.value = row.original
                      deleteDialogOpen.value = true
                    },
                  },
                  () => h(Trash2, { class: 'size-4' })
                )
              : null,
          ])
        : null,
  },
])

const permissionColumns = computed<ColumnDef<SystemPermission>[]>(() => [
  {
    accessorKey: 'name',
    meta: { label: t('rbac.permissions.name') },
    header: () => t('rbac.permissions.name'),
    cell: ({ row }) =>
      h('div', { class: 'flex items-start gap-2' }, [
        h(ShieldCheck, { class: 'mt-0.5 size-4 shrink-0 text-muted-foreground' }),
        h('div', { class: 'min-w-0' }, [
          h('p', { class: 'font-medium' }, row.original.name),
          row.original.description
            ? h('p', { class: 'truncate text-xs text-muted-foreground' }, row.original.description)
            : null,
        ]),
      ]),
  },
  {
    accessorKey: 'code',
    meta: { label: t('rbac.permissions.code') },
    header: () => t('rbac.permissions.code'),
    cell: ({ row }) => h('code', { class: 'text-xs text-muted-foreground' }, row.original.code),
  },
  {
    id: 'hierarchy',
    meta: { label: t('rbac.permissions.hierarchy') },
    header: () => t('rbac.permissions.hierarchy'),
    cell: ({ row }) => {
      const hierarchy = getPermissionHierarchy(row.original)
      return h('div', { class: 'flex min-w-55 items-center gap-1.5 text-sm' }, [
        h(Badge, { variant: 'secondary' }, () => row.original.groupName),
        h(ChevronRight, { class: 'size-3.5 shrink-0 text-muted-foreground' }),
        h('code', { class: 'text-xs' }, hierarchy.resource),
        h(ChevronRight, { class: 'size-3.5 shrink-0 text-muted-foreground' }),
        h('span', hierarchy.action),
      ])
    },
  },
  {
    accessorKey: 'isSystem',
    meta: { label: t('rbac.permissions.source') },
    header: () => t('rbac.permissions.source'),
    cell: ({ row }) =>
      h(Badge, { variant: row.original.isSystem ? 'outline' : 'secondary' }, () =>
        row.original.isSystem ? t('rbac.permissions.built_in') : t('rbac.permissions.custom')
      ),
  },
  {
    accessorKey: 'roleCount',
    meta: { label: t('rbac.permissions.role_count') },
    header: () => t('rbac.permissions.role_count'),
    cell: ({ row }) =>
      row.original.roleCount > 0
        ? h(Badge, { variant: 'outline' }, () =>
            t('rbac.permissions.in_use', { count: row.original.roleCount })
          )
        : '0',
  },
  {
    id: 'actions',
    enableHiding: false,
    meta: { label: t('common.actions') },
    header: () => h('div', { class: 'text-right' }, t('common.actions')),
    cell: ({ row }) => {
      const permission = row.original
      return h('div', { class: 'flex justify-end gap-1' }, [
        h(
          Button,
          {
            variant: 'ghost',
            size: 'icon',
            title: t('rbac.permissions.copy_code'),
            'aria-label': t('rbac.permissions.copy_code'),
            onClick: (event: Event) => {
              event.stopPropagation()
              copyPermissionCode(permission)
            },
          },
          () => h(Copy, { class: 'size-4' })
        ),
        !permission.isSystem && can('permissions:update')
          ? h(
              Button,
              {
                variant: 'ghost',
                size: 'icon',
                title: t('common.edit'),
                'aria-label': t('common.edit'),
                onClick: (event: Event) => {
                  event.stopPropagation()
                  openPermission(permission)
                },
              },
              () => h(Pencil, { class: 'size-4' })
            )
          : null,
        !permission.isSystem && can('permissions:delete')
          ? h(
              Button,
              {
                variant: 'ghost',
                size: 'icon',
                class: 'text-destructive',
                disabled: permission.roleCount > 0,
                title:
                  permission.roleCount > 0
                    ? t('rbac.permissions.delete_disabled')
                    : t('common.delete'),
                'aria-label':
                  permission.roleCount > 0
                    ? t('rbac.permissions.delete_disabled')
                    : t('common.delete'),
                onClick: (event: Event) => {
                  event.stopPropagation()
                  selectedPermission.value = permission
                  deletePermissionDialogOpen.value = true
                },
              },
              () => h(Trash2, { class: 'size-4' })
            )
          : null,
        permission.isSystem
          ? h(
              'span',
              { class: 'self-center text-xs text-muted-foreground' },
              t('rbac.permissions.built_in')
            )
          : null,
      ])
    },
  },
])

async function load(nextPage = page.value) {
  loading.value = true
  try {
    if (props.mode === 'users') {
      const [userPage, rolePage] = await Promise.all([
        listSystemUsers(auth.token, nextPage),
        listSystemRoleCatalog(auth.token),
      ])
      users.value = userPage.items
      roleCatalog.value = rolePage
      page.value = userPage.meta.currentPage
      pageCount.value = userPage.meta.lastPage
    } else if (props.mode === 'roles') {
      const [rolePage, permissionPage] = await Promise.all([
        listSystemRoles(auth.token, nextPage),
        listSystemPermissionCatalog(auth.token),
      ])
      roles.value = rolePage.items
      permissionCatalog.value = permissionPage
      page.value = rolePage.meta.currentPage
      pageCount.value = rolePage.meta.lastPage
    } else {
      const permissionPage = await listSystemPermissions(auth.token, nextPage)
      permissions.value = permissionPage.items
      page.value = permissionPage.meta.currentPage
      pageCount.value = permissionPage.meta.lastPage
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.error'))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  if (props.mode === 'users') openUser()
  if (props.mode === 'roles') openRole()
  if (props.mode === 'permissions') openPermission()
}

function openUser(user?: SystemUser) {
  selectedUser.value = user ?? null
  userForm.value = {
    fullName: user?.fullName ?? '',
    email: user?.email ?? '',
    roleIds: user?.roles?.map((role) => role.id) ?? [],
  }
  userDialogOpen.value = true
}

async function saveUser() {
  saving.value = true
  try {
    const payload = { ...userForm.value }
    if (selectedUser.value) {
      const updated = await updateSystemUser(auth.token, selectedUser.value.id, payload)
      users.value = users.value.map((user) => (user.id === updated.id ? updated : user))
      if (auth.user?.id === updated.id) {
        auth.user = { ...auth.user, roles: updated.roles, permissions: updated.permissions }
      }
    } else {
      const created = await createSystemUser(auth.token, {
        fullName: userForm.value.fullName,
        email: userForm.value.email,
        roleIds: userForm.value.roleIds,
      })
      users.value = [...users.value, created.user]
      createdInitialPassword.value = created.initialPassword
      initialPasswordDialogOpen.value = true
    }
    userDialogOpen.value = false
    toast.success(t('common.success'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.error'))
  } finally {
    saving.value = false
  }
}

async function removeUser() {
  if (!selectedUser.value) return
  saving.value = true
  try {
    await deleteSystemUser(auth.token, selectedUser.value.id)
    users.value = users.value.filter((user) => user.id !== selectedUser.value?.id)
    deleteUserDialogOpen.value = false
    toast.success(t('common.success'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.error'))
  } finally {
    saving.value = false
  }
}

async function copyInitialPassword() {
  try {
    await copyText(createdInitialPassword.value)
    toast.success(t('common.success'))
  } catch {
    toast.error(t('common.error'))
  }
}

async function copyPermissionCode(permission: SystemPermission) {
  try {
    await copyText(permission.code)
    toast.success(t('common.success'))
  } catch {
    toast.error(t('common.error'))
  }
}

async function resetUserPassword() {
  if (!selectedUser.value) return
  saving.value = true
  try {
    const result = await resetSystemUserPassword(auth.token, selectedUser.value.id)
    createdInitialPassword.value = result.initialPassword
    resetPasswordDialogOpen.value = false
    userDialogOpen.value = false
    initialPasswordDialogOpen.value = true
    toast.success(t('common.success'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.error'))
  } finally {
    saving.value = false
  }
}

function openRole(role?: SystemRole) {
  selectedRole.value = role ?? null
  roleForm.value = {
    code: role?.code ?? '',
    name: role?.name ?? '',
    description: role?.description ?? '',
    permissionIds: role?.permissionIds ?? [],
  }
  roleDialogOpen.value = true
}

async function saveRole() {
  saving.value = true
  try {
    const payload = { ...roleForm.value, description: roleForm.value.description || null }
    const role = selectedRole.value
      ? await updateSystemRole(auth.token, selectedRole.value.id, payload)
      : await createSystemRole(auth.token, payload)
    roles.value = selectedRole.value
      ? roles.value.map((item) => (item.id === role.id ? role : item))
      : [...roles.value, role]
    roleDialogOpen.value = false
    toast.success(t('common.success'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.error'))
  } finally {
    saving.value = false
  }
}

async function removeRole() {
  if (!selectedRole.value) return
  saving.value = true
  try {
    await deleteSystemRole(auth.token, selectedRole.value.id)
    roles.value = roles.value.filter((role) => role.id !== selectedRole.value?.id)
    deleteDialogOpen.value = false
    toast.success(t('common.success'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.error'))
  } finally {
    saving.value = false
  }
}

function openPermission(permission?: SystemPermission) {
  selectedPermission.value = permission ?? null
  permissionForm.value = {
    code: permission?.code ?? '',
    name: permission?.name ?? '',
    groupName: permission?.groupName ?? '',
    description: permission?.description ?? '',
  }
  permissionDialogOpen.value = true
}

async function savePermission() {
  saving.value = true
  try {
    const payload = {
      ...permissionForm.value,
      description: permissionForm.value.description || null,
    }
    const permission = selectedPermission.value
      ? await updateSystemPermission(auth.token, selectedPermission.value.id, {
          name: payload.name,
          groupName: payload.groupName,
          description: payload.description,
        })
      : await createSystemPermission(auth.token, payload)
    permissions.value = selectedPermission.value
      ? permissions.value.map((item) => (item.id === permission.id ? permission : item))
      : [...permissions.value, permission]
    permissionDialogOpen.value = false
    toast.success(t('common.success'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.error'))
  } finally {
    saving.value = false
  }
}

async function removePermission() {
  if (!selectedPermission.value) return
  saving.value = true
  try {
    await deleteSystemPermission(auth.token, selectedPermission.value.id)
    permissions.value = permissions.value.filter((item) => item.id !== selectedPermission.value?.id)
    deletePermissionDialogOpen.value = false
    toast.success(t('common.success'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.error'))
  } finally {
    saving.value = false
  }
}

function toggleId(ids: number[], id: number, checked: boolean) {
  return checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id)
}

watch(
  () => props.mode,
  () => {
    page.value = 1
    void load(1)
  },
  { immediate: true }
)
watch(page, (nextPage) => void load(nextPage))
</script>

<template>
  <ListPage
    :title="title"
    :description="description"
    :loading="loading"
    :refresh-label="t('common.refresh')"
    :action-label="actionLabel"
    :show-action="canCreate"
    @refresh="load"
    @action="openCreate"
  >
    <template #refresh-icon
      ><RefreshCw class="size-4" :class="{ 'animate-spin': loading }"
    /></template>
    <template #action-icon><Plus class="size-4" /></template>
    <DataTable
      v-if="mode === 'users'"
      :columns="userColumns"
      :data="users"
      :search-keys="['fullName', 'email']"
      :search-placeholder="t('common.search_placeholder')"
      storage-key="rbac-users-table"
      :empty-message="loading ? t('common.loading') : t('common.no_data')"
      :server-pagination="{ page, pageCount }"
      @page-change="page = $event"
    />
    <DataTable
      v-else-if="mode === 'roles'"
      :columns="roleColumns"
      :data="roles"
      :search-keys="['name', 'code', 'description']"
      :search-placeholder="t('common.search_placeholder')"
      storage-key="rbac-roles-table"
      :empty-message="loading ? t('common.loading') : t('common.no_data')"
      :server-pagination="{ page, pageCount }"
      @page-change="page = $event"
    />
    <DataTable
      v-else
      :columns="permissionColumns"
      :data="filteredPermissions"
      :search-keys="['name', 'code', 'groupName', 'description']"
      :search-placeholder="t('common.search_placeholder')"
      storage-key="rbac-permissions-table"
      filters-layout="inline"
      :empty-message="loading ? t('common.loading') : t('common.no_data')"
      :server-pagination="{ page, pageCount }"
      @page-change="page = $event"
    >
      <template #filters>
        <Select v-model="permissionGroupFilter">
          <SelectTrigger class="w-44"
            ><SelectValue :placeholder="t('rbac.permissions.group')"
          /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{{ t('rbac.permissions.all_groups') }}</SelectItem>
            <SelectItem v-for="group in permissionGroups" :key="group" :value="group">{{
              group
            }}</SelectItem>
          </SelectContent>
        </Select>
      </template>
    </DataTable>

    <template #dialogs>
      <Dialog v-model:open="userDialogOpen">
        <FormDialogContent
          :title="selectedUser ? t('rbac.users.edit') : t('rbac.users.create')"
          :description="selectedUser ? t('rbac.users.form_desc') : t('rbac.users.create_desc')"
          class="sm:max-w-130"
        >
          <form @submit.prevent="saveUser">
            <div class="grid gap-4 px-6 pb-6">
              <div class="grid gap-2">
                <Label for="managed-user-full-name">{{ t('rbac.users.name') }}</Label>
                <Input
                  id="managed-user-full-name"
                  v-model="userForm.fullName"
                  :placeholder="t('rbac.users.name')"
                />
              </div>
              <div class="grid gap-2">
                <Label for="managed-user-email">{{ t('auth.email') }}</Label>
                <Input
                  id="managed-user-email"
                  v-model="userForm.email"
                  type="email"
                  :placeholder="t('auth.email')"
                />
              </div>
              <div class="grid gap-2">
                <p class="text-sm font-medium">{{ t('rbac.users.assign_roles') }}</p>
                <div class="space-y-3">
                  <label
                    v-for="role in editableUserRoles"
                    :key="role.id"
                    class="flex items-center gap-3 rounded-md border p-3"
                    :class="{ 'cursor-pointer': !selectedUserIsSuperAdmin }"
                  >
                    <Checkbox
                      :model-value="userForm.roleIds.includes(role.id)"
                      :disabled="selectedUserIsSuperAdmin"
                      @update:model-value="
                        userForm.roleIds = toggleId(userForm.roleIds, role.id, Boolean($event))
                      "
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
                  v-if="selectedUser && auth.user?.id !== selectedUser.id"
                  type="button"
                  variant="outline"
                  :disabled="saving"
                  @click="resetPasswordDialogOpen = true"
                >
                  <KeyRound class="size-4" />{{ t('rbac.users.reset_password') }}
                </Button>
              </template>
              <Button type="button" variant="outline" @click="userDialogOpen = false">{{
                t('common.cancel')
              }}</Button>
              <Button
                type="submit"
                :disabled="saving || !userForm.fullName.trim() || !userForm.email.trim()"
                >{{ t('common.save') }}</Button
              >
            </FormDialogFooter>
          </form>
        </FormDialogContent>
      </Dialog>

      <Dialog v-model:open="initialPasswordDialogOpen"
        ><DialogContent
          ><DialogHeader
            ><DialogTitle>{{ t('rbac.users.initial_password') }}</DialogTitle
            ><DialogDescription>{{
              t('rbac.users.initial_password_desc')
            }}</DialogDescription></DialogHeader
          >
          <div class="flex items-center gap-2 rounded-md border bg-muted p-3">
            <code class="min-w-0 flex-1 overflow-x-auto text-sm">{{ createdInitialPassword }}</code
            ><Button variant="secondary" size="icon" @click="copyInitialPassword"
              ><Copy class="size-4"
            /></Button>
          </div>
          <DialogFooter
            ><Button @click="initialPasswordDialogOpen = false">{{
              t('common.confirm')
            }}</Button></DialogFooter
          ></DialogContent
        ></Dialog
      >

      <Dialog v-model:open="roleDialogOpen">
        <FormDialogContent
          :title="selectedRole ? t('rbac.roles.edit') : t('rbac.roles.create')"
          :description="t('rbac.roles.form_desc')"
          class="sm:max-w-225"
        >
          <form class="flex min-h-0 flex-1 flex-col overflow-hidden" @submit.prevent="saveRole">
            <div class="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 pb-6">
              <div v-if="!selectedRole" class="grid gap-2">
                <Label for="role-code">{{ t('rbac.roles.code') }}</Label>
                <Input id="role-code" v-model="roleForm.code" placeholder="role-code" />
              </div>
              <div class="grid gap-2">
                <Label for="role-name">{{ t('rbac.roles.name') }}</Label>
                <Input id="role-name" v-model="roleForm.name" :placeholder="t('rbac.roles.name')" />
              </div>
              <div class="grid gap-2">
                <Label for="role-description">{{ t('rbac.roles.description') }}</Label>
                <Textarea
                  id="role-description"
                  v-model="roleForm.description"
                  :placeholder="t('rbac.roles.description')"
                />
              </div>
              <div class="grid gap-2">
                <p class="text-sm font-medium">{{ t('rbac.roles.permissions') }}</p>
                <PermissionTransfer
                  v-model="roleForm.permissionIds"
                  :permissions="permissionCatalog"
                />
              </div>
            </div>
            <FormDialogFooter class="shrink-0 justify-end">
              <Button type="button" variant="outline" @click="roleDialogOpen = false">{{
                t('common.cancel')
              }}</Button>
              <Button
                type="submit"
                :disabled="
                  saving || !roleForm.name.trim() || (!selectedRole && !roleForm.code.trim())
                "
                >{{ t('common.save') }}</Button
              >
            </FormDialogFooter>
          </form>
        </FormDialogContent>
      </Dialog>

      <Dialog v-model:open="permissionDialogOpen">
        <FormDialogContent
          :title="selectedPermission ? t('rbac.permissions.edit') : t('rbac.permissions.create')"
          :description="t('rbac.permissions.form_desc')"
        >
          <form @submit.prevent="savePermission">
            <div class="grid gap-4 px-6 pb-6">
              <div v-if="!selectedPermission" class="grid gap-2">
                <Label for="permission-code">{{ t('rbac.permissions.code') }}</Label>
                <Input
                  id="permission-code"
                  v-model="permissionForm.code"
                  placeholder="resource:action"
                />
              </div>
              <div class="grid gap-2">
                <Label for="permission-name">{{ t('rbac.permissions.name') }}</Label>
                <Input
                  id="permission-name"
                  v-model="permissionForm.name"
                  :placeholder="t('rbac.permissions.name')"
                />
              </div>
              <div class="grid gap-2">
                <Label for="permission-group">{{ t('rbac.permissions.group') }}</Label>
                <Input
                  id="permission-group"
                  v-model="permissionForm.groupName"
                  :placeholder="t('rbac.permissions.group')"
                />
              </div>
              <div class="grid gap-2">
                <Label for="permission-description">{{ t('rbac.permissions.description') }}</Label>
                <Textarea
                  id="permission-description"
                  v-model="permissionForm.description"
                  :placeholder="t('rbac.permissions.description')"
                />
              </div>
            </div>
            <FormDialogFooter class="justify-end">
              <Button type="button" variant="outline" @click="permissionDialogOpen = false">{{
                t('common.cancel')
              }}</Button>
              <Button
                type="submit"
                :disabled="
                  saving ||
                  !permissionForm.name.trim() ||
                  !permissionForm.groupName.trim() ||
                  (!selectedPermission && !permissionForm.code.trim())
                "
                >{{ t('common.save') }}</Button
              >
            </FormDialogFooter>
          </form>
        </FormDialogContent>
      </Dialog>

      <ConfirmDialog
        v-model:open="deleteDialogOpen"
        :title="t('rbac.roles.delete_title')"
        :description="t('rbac.roles.delete_desc')"
        :confirm-label="t('common.delete')"
        :loading="saving"
        @confirm="removeRole"
      />
      <ConfirmDialog
        v-model:open="deleteUserDialogOpen"
        :title="t('rbac.users.delete_title')"
        :description="t('rbac.users.delete_desc')"
        :confirm-label="t('common.delete')"
        :loading="saving"
        @confirm="removeUser"
      />
      <ConfirmDialog
        v-model:open="deletePermissionDialogOpen"
        :title="t('rbac.permissions.delete_title')"
        :description="t('rbac.permissions.delete_desc')"
        :confirm-label="t('common.delete')"
        :loading="saving"
        @confirm="removePermission"
      />
      <ConfirmDialog
        v-model:open="resetPasswordDialogOpen"
        :title="t('rbac.users.reset_password')"
        :description="t('rbac.users.reset_password_confirm')"
        :confirm-label="t('rbac.users.reset_password')"
        :loading="saving"
        @confirm="resetUserPassword"
      />
    </template>
  </ListPage>
</template>
