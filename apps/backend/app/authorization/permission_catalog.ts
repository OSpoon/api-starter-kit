export const permissionCodes = [
  'dashboard:view',
  'system-status:read',
  'llm-config:read',
  'llm-config:update',
  'llm-config:test',
  'im-config:read',
  'api-keys:read',
  'api-keys:create',
  'api-keys:update',
  'api-keys:delete',
  'users:read',
  'users:create',
  'users:update',
  'users:delete',
  'roles:read',
  'roles:create',
  'roles:update',
  'roles:delete',
  'permissions:read',
  'permissions:create',
  'permissions:update',
  'permissions:delete',
  'audit-logs:read',
  'knowledge:read',
  'knowledge:manage',
  'wecom-templates:read',
  'wecom-templates:create',
  'wecom-templates:update',
  'wecom-templates:delete',
  'wecom-templates:send',
  'wecom-templates:test',
] as const

export type PermissionCode = (typeof permissionCodes)[number]

/**
 * The permission directory mirrors the product navigation groups. Keep this
 * mapping as the runtime source of truth so menu renames are reflected even
 * before an environment has replayed the latest regrouping migration.
 */
export const systemPermissionGroupNames: Record<string, string> = {
  'dashboard:view': '工作台',
  'system-status:read': '系统管理',
  'llm-config:read': 'Agent管理',
  'llm-config:update': 'Agent管理',
  'llm-config:test': 'Agent管理',
  'im-config:read': 'Agent管理',
  'knowledge:read': 'Agent管理',
  'knowledge:manage': 'Agent管理',
  'users:read': '权限管理',
  'users:create': '权限管理',
  'users:update': '权限管理',
  'users:delete': '权限管理',
  'roles:read': '权限管理',
  'roles:create': '权限管理',
  'roles:update': '权限管理',
  'roles:delete': '权限管理',
  'permissions:read': '权限管理',
  'permissions:create': '权限管理',
  'permissions:update': '权限管理',
  'permissions:delete': '权限管理',
  'api-keys:read': '系统管理',
  'api-keys:create': '系统管理',
  'api-keys:update': '系统管理',
  'api-keys:delete': '系统管理',
  'audit-logs:read': '系统管理',
  'wecom-templates:read': '系统管理',
  'wecom-templates:create': '系统管理',
  'wecom-templates:update': '系统管理',
  'wecom-templates:delete': '系统管理',
  'wecom-templates:send': '系统管理',
  'wecom-templates:test': '系统管理',
}

export function getSystemPermissionGroupName(code: string, fallback: string) {
  return systemPermissionGroupNames[code] ?? fallback
}
