import { apiRequest } from '@/lib/api'
import { readItem } from '@/lib/api-types'

export interface SystemRole {
  id: number
  code: string
  name: string
  description: string | null
  isSystem: boolean
  permissionIds: number[]
  userCount: number
}

export interface SystemPermission {
  id: number
  code: string
  name: string
  groupName: string
  description: string | null
  isSystem: boolean
  roleCount: number
}

export interface SystemUser {
  id: number
  fullName: string | null
  email: string
  roles: Array<{ id: number; code: string; name: string }>
  permissions: string[]
  twoFactorEnabled: boolean
}

export interface AuditLogEntry {
  id: number
  action: string
  targetType: string
  targetId: string | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  requestId: string | null
  createdAt: string
  actor: { id: number; fullName: string | null; email: string } | null
}

export interface AuditLogPage {
  items: AuditLogEntry[]
  meta: { currentPage: number; perPage: number; lastPage: number; total: number }
}
export interface SystemPage<T> {
  items: T[]
  meta: { currentPage: number; lastPage: number }
}
export type SystemRoleOption = Pick<SystemRole, 'id' | 'code' | 'name'>
export type SystemPermissionOption = Pick<SystemPermission, 'id' | 'code' | 'name' | 'groupName'>

const authOptions = (token: string | null) => ({ token })

export async function listSystemUsers(token: string | null, page = 1) {
  return readItem(
    await apiRequest<SystemPage<SystemUser>>(
      `/api/v1/system/users?page=${page}&limit=20`,
      authOptions(token)
    )
  )
}

export type SystemUserPayload = {
  fullName: string
  email: string
  roleIds: number[]
}

export type CreatedSystemUser = { user: SystemUser; initialPassword: string }

export async function createSystemUser(token: string | null, payload: SystemUserPayload) {
  return readItem(
    await apiRequest<CreatedSystemUser>('/api/v1/system/users', {
      ...authOptions(token),
      method: 'POST',
      body: JSON.stringify(payload),
    })
  )
}

export async function updateSystemUser(
  token: string | null,
  id: number,
  payload: SystemUserPayload
) {
  return readItem(
    await apiRequest<SystemUser>(`/api/v1/system/users/${id}`, {
      ...authOptions(token),
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  )
}

export async function deleteSystemUser(token: string | null, id: number) {
  return readItem(
    await apiRequest<{ id: number; deleted: boolean }>(`/api/v1/system/users/${id}`, {
      ...authOptions(token),
      method: 'DELETE',
    })
  )
}

export async function resetSystemUserPassword(token: string | null, id: number) {
  return readItem(
    await apiRequest<{ id: number; initialPassword: string }>(
      `/api/v1/system/users/${id}/reset-password`,
      { ...authOptions(token), method: 'POST' }
    )
  )
}

export async function listSystemRoles(token: string | null, page = 1) {
  return readItem(
    await apiRequest<SystemPage<SystemRole>>(
      `/api/v1/system/roles?page=${page}&limit=20`,
      authOptions(token)
    )
  )
}

export async function listSystemRoleCatalog(token: string | null) {
  return readItem(
    await apiRequest<SystemRoleOption[]>('/api/v1/system/roles/catalog', authOptions(token))
  )
}

export async function createSystemRole(
  token: string | null,
  payload: Pick<SystemRole, 'code' | 'name' | 'description' | 'permissionIds'>
) {
  return readItem(
    await apiRequest<SystemRole>('/api/v1/system/roles', {
      ...authOptions(token),
      method: 'POST',
      body: JSON.stringify(payload),
    })
  )
}

export async function updateSystemRole(
  token: string | null,
  id: number,
  payload: Pick<SystemRole, 'name' | 'description' | 'permissionIds'>
) {
  return readItem(
    await apiRequest<SystemRole>(`/api/v1/system/roles/${id}`, {
      ...authOptions(token),
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  )
}

export async function deleteSystemRole(token: string | null, id: number) {
  return readItem(
    await apiRequest<{ id: number; deleted: boolean }>(`/api/v1/system/roles/${id}`, {
      ...authOptions(token),
      method: 'DELETE',
    })
  )
}

export async function listSystemPermissions(token: string | null, page = 1) {
  return readItem(
    await apiRequest<SystemPage<SystemPermission>>(
      `/api/v1/system/permissions?page=${page}&limit=20`,
      authOptions(token)
    )
  )
}

export async function listSystemPermissionCatalog(token: string | null) {
  return readItem(
    await apiRequest<SystemPermissionOption[]>(
      '/api/v1/system/permissions/catalog',
      authOptions(token)
    )
  )
}

export type SystemPermissionPayload = Pick<
  SystemPermission,
  'code' | 'name' | 'groupName' | 'description'
>

export async function createSystemPermission(
  token: string | null,
  payload: SystemPermissionPayload
) {
  return readItem(
    await apiRequest<SystemPermission>('/api/v1/system/permissions', {
      ...authOptions(token),
      method: 'POST',
      body: JSON.stringify(payload),
    })
  )
}

export async function updateSystemPermission(
  token: string | null,
  id: number,
  payload: Omit<SystemPermissionPayload, 'code'>
) {
  return readItem(
    await apiRequest<SystemPermission>(`/api/v1/system/permissions/${id}`, {
      ...authOptions(token),
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  )
}

export async function deleteSystemPermission(token: string | null, id: number) {
  return readItem(
    await apiRequest<{ id: number; deleted: boolean }>(`/api/v1/system/permissions/${id}`, {
      ...authOptions(token),
      method: 'DELETE',
    })
  )
}

export async function listAuditLogs(token: string | null, page = 1) {
  return readItem(
    await apiRequest<AuditLogPage>(
      `/api/v1/system/audit-logs?page=${page}&limit=20`,
      authOptions(token)
    )
  )
}
