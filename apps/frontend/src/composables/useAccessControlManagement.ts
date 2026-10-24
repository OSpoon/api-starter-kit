import type { Ref } from 'vue'
import { toast } from 'vue-sonner'

import {
  createSystemRole,
  createSystemUser,
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
  const roleFilter = ref<string[]>([])
  const channelFilter = ref<string[]>([])
  const search = ref('')
  const loading = ref(false)
  const page = ref(1)
  const pageCount = ref(1)
  const saving = ref(false)
  const userDialogOpen = ref(false)
  const initialPasswordDialogOpen = ref(false)
  const resetPasswordDialogOpen = ref(false)
  const roleDialogOpen = ref(false)
  const deleteRoleDialogOpen = ref(false)
  const deleteUserDialogOpen = ref(false)
  const initialPasswordCopied = ref(false)
  const initialPasswordCopiedReset = useTimeoutFn(
    () => {
      initialPasswordCopied.value = false
    },
    2000,
    { immediate: false }
  )
  const selectedUser = ref<SystemUser | null>(null)
  const selectedRole = ref<SystemRole | null>(null)
  const createdInitialPassword = ref('')
  const permissionGroups = computed(() =>
    [...new Set(permissionCatalog.value.map((permission) => permission.groupName))].sort()
  )
  const roleFilterOptions = computed(() =>
    roleCatalog.value.map((role) => ({ value: String(role.id), label: role.name }))
  )
  const channelFilterOptions = computed(() => [
    { value: 'none', label: t('rbac.users.no_bound_channels') },
    { value: 'wecom', label: t('rbac.users.channels.wecom') },
    { value: 'feishu', label: t('rbac.users.channels.feishu') },
    { value: 'dingtalk', label: t('rbac.users.channels.dingtalk') },
  ])

  async function load(nextPage = page.value) {
    loading.value = true
    try {
      if (mode.value === 'users') {
        const [userPage, catalog] = await Promise.all([
          listSystemUsers(auth.token, nextPage, search.value, {
            roleIds: roleFilter.value,
            channels: channelFilter.value,
          }),
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
  function openCreate() {
    if (mode.value === 'users') openUser()
    if (mode.value === 'roles') openRole()
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
        initialPasswordCopied.value = false
        initialPasswordCopiedReset.stop()
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
  async function resetUserPassword() {
    if (!selectedUser.value) return
    saving.value = true
    try {
      const result = await resetSystemUserPassword(auth.token, selectedUser.value.id)
      createdInitialPassword.value = result.initialPassword
      initialPasswordCopied.value = false
      initialPasswordCopiedReset.stop()
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
  async function copyInitialPassword(element?: HTMLElement | null) {
    try {
      await copyText(createdInitialPassword.value, element)
      initialPasswordCopied.value = true
      initialPasswordCopiedReset.stop()
      initialPasswordCopiedReset.start()
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
  watch([roleFilter, channelFilter], () => {
    if (mode.value === 'users') resetPageAndLoad()
  })

  return {
    users,
    roles,
    permissions,
    roleCatalog,
    permissionCatalog,
    permissionGroupFilter,
    permissionGroups,
    roleFilter,
    channelFilter,
    roleFilterOptions,
    channelFilterOptions,
    search,
    loading,
    page,
    pageCount,
    saving,
    userDialogOpen,
    initialPasswordDialogOpen,
    resetPasswordDialogOpen,
    roleDialogOpen,
    deleteRoleDialogOpen,
    deleteUserDialogOpen,
    selectedUser,
    selectedRole,
    createdInitialPassword,
    initialPasswordCopied,
    load,
    openCreate,
    openUser,
    openRole,
    saveUser,
    saveRole,
    removeUser,
    removeRole,
    resetUserPassword,
    copyInitialPassword,
    copyPermissionCode,
  }
}
