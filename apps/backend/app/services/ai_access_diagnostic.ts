export type AiAccessRole = {
  code: string
  name: string
  permissions: string[]
}

export function buildMyAccessDiagnosis(roles: AiAccessRole[], requestedPermission?: string) {
  const isSuperAdmin = roles.some((role) => role.code === 'super-admin')
  const effectivePermissions = isSuperAdmin
    ? ['*']
    : [...new Set(roles.flatMap((role) => role.permissions))].sort()
  const granted = requestedPermission
    ? isSuperAdmin || effectivePermissions.includes(requestedPermission)
    : undefined

  return {
    roles: roles.map(({ code, name }) => ({ code, name })),
    effectivePermissions,
    requestedPermission: requestedPermission
      ? {
          code: requestedPermission,
          granted,
        }
      : null,
  }
}
