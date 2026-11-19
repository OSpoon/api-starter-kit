import { apiRequest } from '@/lib/api'
import { readItem } from '@/lib/api-types'
import { buildListQuery } from '@/lib/list-query'

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
  roles?: Array<{ id: number; code: string; name: string }>
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
  eventVersion: number
  actorType: string
  source: string
  outcome: string
  reasonCode: string | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  requestId: string | null
  traceId: string | null
  requestMethod: string | null
  requestRoute: string | null
  createdAt: string
  actor: { id: number; fullName: string | null; email: string } | null
}

export interface AuditLogPage {
  items: AuditLogEntry[]
  meta: { currentPage: number; perPage: number; lastPage: number; total: number }
}
export interface AuditLogFilters {
  action?: string
  targetType?: string
  targetId?: string
  actorName?: string
  actorEmail?: string
  source?: string[]
  outcome?: string[]
  actorType?: string[]
}
export interface SystemPage<T> {
  items: T[]
  meta: { currentPage: number; lastPage: number }
}
export type SystemRoleOption = Pick<SystemRole, 'id' | 'code' | 'name'>
export type SystemPermissionOption = Pick<SystemPermission, 'id' | 'code' | 'name' | 'groupName'>

const authOptions = (token: string | null) => ({ token })

export type SystemUserListFilters = {
  fullName?: string
  email?: string
  roleIds?: string[]
  channels?: string[]
}

export async function listSystemUsers(
  token: string | null,
  page = 1,
  filters: SystemUserListFilters = {}
) {
  const extra: Record<string, string> = {}
  if (filters.fullName?.trim()) extra.fullName = filters.fullName.trim()
  if (filters.email?.trim()) extra.email = filters.email.trim()
  if (filters.roleIds?.length) extra.roleIds = filters.roleIds.join(',')
  if (filters.channels?.length) extra.channels = filters.channels.join(',')
  return readItem(
    await apiRequest<SystemPage<SystemUser>>(
      `/api/v1/system/users?${buildListQuery(page, extra)}`,
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

export type SystemRoleListFilters = { code?: string; name?: string; description?: string }

export async function listSystemRoles(
  token: string | null,
  page = 1,
  filters: SystemRoleListFilters = {}
) {
  const extra: Record<string, string> = {}
  if (filters.code?.trim()) extra.code = filters.code.trim()
  if (filters.name?.trim()) extra.name = filters.name.trim()
  if (filters.description?.trim()) extra.description = filters.description.trim()
  return readItem(
    await apiRequest<SystemPage<SystemRole>>(
      `/api/v1/system/roles?${buildListQuery(page, extra)}`,
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
  payload: { code: string; name: string; description: string; permissionIds: number[] }
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
  payload: { name: string; description: string; permissionIds: number[] }
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

export type SystemPermissionListFilters = {
  code?: string
  name?: string
  description?: string
  groupName?: string
  groupNames?: string[]
}

export async function listSystemPermissions(
  token: string | null,
  page = 1,
  filters: SystemPermissionListFilters = {}
) {
  const extra: Record<string, string> = {}
  if (filters.code?.trim()) extra.code = filters.code.trim()
  if (filters.name?.trim()) extra.name = filters.name.trim()
  if (filters.description?.trim()) extra.description = filters.description.trim()
  if (filters.groupNames?.length) extra.groupNames = filters.groupNames.join(',')
  else if (filters.groupName?.trim()) extra.groupName = filters.groupName.trim()
  return readItem(
    await apiRequest<SystemPage<SystemPermission>>(
      `/api/v1/system/permissions?${buildListQuery(page, extra)}`,
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

export async function listAuditLogs(token: string | null, page = 1, filters: AuditLogFilters = {}) {
  const extra: Record<string, string> = {}
  if (filters.action?.trim()) extra.action = filters.action.trim()
  if (filters.targetType?.trim()) extra.targetType = filters.targetType.trim()
  if (filters.targetId?.trim()) extra.targetId = filters.targetId.trim()
  if (filters.actorName?.trim()) extra.actorName = filters.actorName.trim()
  if (filters.actorEmail?.trim()) extra.actorEmail = filters.actorEmail.trim()
  if (filters.source?.length) extra.source = filters.source.join(',')
  if (filters.outcome?.length) extra.outcome = filters.outcome.join(',')
  if (filters.actorType?.length) extra.actorType = filters.actorType.join(',')
  return readItem(
    await apiRequest<AuditLogPage>(
      `/api/v1/system/audit-logs?${buildListQuery(page, extra)}`,
      authOptions(token)
    )
  )
}
