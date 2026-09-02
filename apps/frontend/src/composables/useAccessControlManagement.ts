import type { Ref } from 'vue'
import { toast } from 'vue-sonner'

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
} from '@/features/access-control/api'
import { useCopyText } from '@/lib/clipboard'
import { useAuthStore } from '@/stores/auth'

export type AccessControlMode = 'users' | 'roles' | 'permissions'
export type ManagedUserPayload = { fullName: string; email: string; roleIds: number[] }
export type ManagedRolePayload = {
  code: string
  name: string
  description: string
  permissionIds: number[]
}
export type ManagedPermissionPayload = {
  code: string
  name: string
  groupName: string
  description: string
}

export function useAccessControlManagement(mode: Ref<AccessControlMode>) {
  const auth = useAuthStore()
  const { copy: copyText } = useCopyText()
  const { t } = useI18n()
  const users = ref<SystemUser[]>([])
  const roles = ref<SystemRole[]>([])
  const permissions = ref<SystemPermission[]>([])
  const roleCatalog = ref<SystemRoleOption[]>([])
  const permissionCatalog = ref<SystemPermissionOption[]>([])
  const permissionGroupFilter = ref('__all__')
  const search = ref('')
  const loading = ref(false)
  const page = ref(1)
  const pageCount = ref(1)
  const saving = ref(false)
  const userDialogOpen = ref(false)
  const initialPasswordDialogOpen = ref(false)
  const resetPasswordDialogOpen = ref(false)
  const roleDialogOpen = ref(false)
  const permissionDialogOpen = ref(false)
  const deleteRoleDialogOpen = ref(false)
  const deleteUserDialogOpen = ref(false)
  const deletePermissionDialogOpen = ref(false)
  const selectedUser = ref<SystemUser | null>(null)
  const selectedRole = ref<SystemRole | null>(null)
  const selectedPermission = ref<SystemPermission | null>(null)
  const createdInitialPassword = ref('')
  const permissionGroups = computed(() =>
    [...new Set(permissionCatalog.value.map((permission) => permission.groupName))].sort()
  )

  async function load(nextPage = page.value) {
    loading.value = true
    try {
      if (mode.value === 'users') {
        const [userPage, catalog] = await Promise.all([
          listSystemUsers(auth.token, nextPage, search.value),
          listSystemRoleCatalog(auth.token),
        ])
        users.value = userPage.items
        roleCatalog.value = catalog
        page.value = userPage.meta.currentPage
        pageCount.value = userPage.meta.lastPage
      } else if (mode.value === 'roles') {
        const [rolePage, catalog] = await Promise.all([
          listSystemRoles(auth.token, nextPage, search.value),
          listSystemPermissionCatalog(auth.token),
        ])
        roles.value = rolePage.items
        permissionCatalog.value = catalog
        page.value = rolePage.meta.currentPage
        pageCount.value = rolePage.meta.lastPage
      } else {
        const [permissionPage, catalog] = await Promise.all([
          listSystemPermissions(
            auth.token,
            nextPage,
            search.value,
            permissionGroupFilter.value === '__all__' ? '' : permissionGroupFilter.value
          ),
          listSystemPermissionCatalog(auth.token),
        ])
        permissions.value = permissionPage.items
        permissionCatalog.value = catalog
        page.value = permissionPage.meta.currentPage
        pageCount.value = permissionPage.meta.lastPage
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    } finally {
      loading.value = false
    }
  }

  function openUser(user?: SystemUser) {
    selectedUser.value = user ?? null
    userDialogOpen.value = true
  }
  function openRole(role?: SystemRole) {
    selectedRole.value = role ?? null
    roleDialogOpen.value = true
  }
  function openPermission(permission?: SystemPermission) {
    selectedPermission.value = permission ?? null
    permissionDialogOpen.value = true
  }
  function openCreate() {
    if (mode.value === 'users') openUser()
    if (mode.value === 'roles') openRole()
    if (mode.value === 'permissions') openPermission()
  }

  async function saveUser(payload: ManagedUserPayload) {
    saving.value = true
    try {
      if (selectedUser.value) {
        const updated = await updateSystemUser(auth.token, selectedUser.value.id, payload)
        if (auth.user?.id === updated.id)
          auth.user = { ...auth.user, roles: updated.roles, permissions: updated.permissions }
      } else {
        const created = await createSystemUser(auth.token, payload)
        createdInitialPassword.value = created.initialPassword
        initialPasswordDialogOpen.value = true
      }
      await load()
      userDialogOpen.value = false
      toast.success(t('common.success'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    } finally {
      saving.value = false
    }
  }

  async function saveRole(payload: ManagedRolePayload) {
    saving.value = true
    try {
      const normalized = { ...payload, description: payload.description || null }
      if (selectedRole.value) await updateSystemRole(auth.token, selectedRole.value.id, normalized)
      else await createSystemRole(auth.token, normalized)
      await load()
      roleDialogOpen.value = false
      toast.success(t('common.success'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    } finally {
      saving.value = false
    }
  }

  async function savePermission(payload: ManagedPermissionPayload) {
    saving.value = true
    try {
      const normalized = { ...payload, description: payload.description || null }
      if (selectedPermission.value) {
        await updateSystemPermission(auth.token, selectedPermission.value.id, {
          name: normalized.name,
          groupName: normalized.groupName,
          description: normalized.description,
        })
      } else await createSystemPermission(auth.token, normalized)
      await load()
      permissionDialogOpen.value = false
      toast.success(t('common.success'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    } finally {
      saving.value = false
    }
  }

  async function reloadAfterRemoval(itemCount: number) {
    const nextPage = itemCount <= 1 && page.value > 1 ? page.value - 1 : page.value
    if (nextPage !== page.value) page.value = nextPage
    else await load(nextPage)
  }
  async function removeUser() {
    if (!selectedUser.value) return
    saving.value = true
    try {
      await deleteSystemUser(auth.token, selectedUser.value.id)
      await reloadAfterRemoval(users.value.length)
      deleteUserDialogOpen.value = false
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
      await reloadAfterRemoval(roles.value.length)
      deleteRoleDialogOpen.value = false
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
      await reloadAfterRemoval(permissions.value.length)
      deletePermissionDialogOpen.value = false
      toast.success(t('common.success'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    } finally {
      saving.value = false
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
  function resetPageAndLoad() {
    if (page.value === 1) void load(1)
    else page.value = 1
  }

  watch(
    mode,
    () => {
      page.value = 1
      void load(1)
    },
    { immediate: true }
  )
  watch(page, (nextPage) => void load(nextPage))
  watch(search, resetPageAndLoad)
  watch(permissionGroupFilter, () => {
    if (mode.value === 'permissions') resetPageAndLoad()
  })

  return {
    users,
    roles,
    permissions,
    roleCatalog,
    permissionCatalog,
    permissionGroupFilter,
    permissionGroups,
    search,
    loading,
    page,
    pageCount,
    saving,
    userDialogOpen,
    initialPasswordDialogOpen,
    resetPasswordDialogOpen,
    roleDialogOpen,
    permissionDialogOpen,
    deleteRoleDialogOpen,
    deleteUserDialogOpen,
    deletePermissionDialogOpen,
    selectedUser,
    selectedRole,
    selectedPermission,
    createdInitialPassword,
    load,
    openCreate,
    openUser,
    openRole,
    openPermission,
    saveUser,
    saveRole,
    savePermission,
    removeUser,
    removeRole,
    removePermission,
    resetUserPassword,
    copyInitialPassword,
    copyPermissionCode,
  }
}
