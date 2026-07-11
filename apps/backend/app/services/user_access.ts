import type User from '#models/user'

export async function loadUserAccess(user: User) {
  await user.load('roles', (roles) => roles.preload('permissions'))
  return user
}
