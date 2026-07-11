import { useAuthStore } from '@/stores/auth'

export type PermissionRequirement = string | string[] | undefined

export function hasPermission(
  permissions: string[] | undefined,
  requirement: PermissionRequirement,
  mode: 'all' | 'any' = 'all'
) {
  if (!requirement) {
    return true
  }

  const required = Array.isArray(requirement) ? requirement : [requirement]
  if (permissions?.includes('*')) {
    return true
  }

  return mode === 'all'
    ? required.every((permission) => permissions?.includes(permission))
    : required.some((permission) => permissions?.includes(permission))
}

export function usePermission() {
  const auth = useAuthStore()

  return {
    can: (requirement: PermissionRequirement) => hasPermission(auth.user?.permissions, requirement),
    canAny: (requirements: string[]) => hasPermission(auth.user?.permissions, requirements, 'any'),
    canAll: (requirements: string[]) => hasPermission(auth.user?.permissions, requirements),
  }
}
