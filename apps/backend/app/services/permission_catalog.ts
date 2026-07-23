export const permissionCodes = [
  'dashboard:view',
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
] as const

export type PermissionCode = (typeof permissionCodes)[number]
