import { ChevronRight, Copy, Pencil, ShieldCheck, Trash2 } from '@lucide/vue'
import type { ColumnDef } from '@tanstack/vue-table'
import type { ComputedRef } from 'vue'

import PermissionRolesPopover from '@/components/access-control/PermissionRolesPopover.vue'
import RolePermissionsPopover from '@/components/access-control/RolePermissionsPopover.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  SystemPermission,
  SystemPermissionOption,
  SystemRole,
  SystemUser,
} from '@/features/access-control/api'
import { usePermission } from '@/lib/permission'

type AccessControlColumnActions = {
  currentUserId: ComputedRef<number | undefined>
  editUser: (user: SystemUser) => void
  deleteUser: (user: SystemUser) => void
  permissionCatalog: ComputedRef<SystemPermissionOption[]>
  editRole: (role: SystemRole) => void
  deleteRole: (role: SystemRole) => void
  copyPermission: (permission: SystemPermission) => void
  editPermission: (permission: SystemPermission) => void
  deletePermission: (permission: SystemPermission) => void
}

export function useAccessControlColumns(actions: AccessControlColumnActions) {
  const { t } = useI18n()
  const { can } = usePermission()

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
                    actions.editUser(row.original)
                  },
                },
                () => h(Pencil, { class: 'size-4' })
              )
            : null,
          can('users:delete') && actions.currentUserId.value !== row.original.id
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
                    actions.deleteUser(row.original)
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
            row.original.isSystem
              ? h(Badge, { variant: 'secondary' }, () => t('rbac.system'))
              : null,
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
      meta: { label: t('rbac.roles.permissions') },
      header: () => t('rbac.roles.permissions'),
      cell: ({ row }) => {
        const permissionById = new Map(
          actions.permissionCatalog.value.map((permission) => [permission.id, permission])
        )
        const permissions = row.original.permissionIds
          .map((id) => permissionById.get(id))
          .filter((permission): permission is SystemPermissionOption => Boolean(permission))

        return h(RolePermissionsPopover, { role: row.original, permissions })
      },
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
                        actions.editRole(row.original)
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
                        actions.deleteRole(row.original)
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
              ? h(
                  'p',
                  { class: 'truncate text-xs text-muted-foreground' },
                  row.original.description
                )
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
        const [resource, action] = row.original.code.split(':')
        return h('div', { class: 'flex min-w-55 items-center gap-1.5 text-sm' }, [
          h(Badge, { variant: 'secondary' }, () => row.original.groupName),
          h(ChevronRight, { class: 'size-3.5 shrink-0 text-muted-foreground' }),
          h('code', { class: 'text-xs' }, resource ?? row.original.code),
          h(ChevronRight, { class: 'size-3.5 shrink-0 text-muted-foreground' }),
          h('span', action ?? row.original.code),
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
      cell: ({ row }) => {
        const roles = row.original.roles ?? []
        return roles.length ? h(PermissionRolesPopover, { permission: row.original }) : '0'
      },
    },
    {
      id: 'actions',
      enableHiding: false,
      meta: { label: t('common.actions') },
      header: () => h('div', { class: 'text-right' }, t('common.actions')),
      cell: ({ row }) => {
        const permission = row.original
        const deleteLabel =
          permission.roleCount > 0 ? t('rbac.permissions.delete_disabled') : t('common.delete')
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
                actions.copyPermission(permission)
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
                    actions.editPermission(permission)
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
                  title: deleteLabel,
                  'aria-label': deleteLabel,
                  onClick: (event: Event) => {
                    event.stopPropagation()
                    actions.deletePermission(permission)
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

  return { userColumns, roleColumns, permissionColumns }
}
