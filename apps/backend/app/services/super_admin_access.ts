import Role from '#models/role'
import User from '#models/user'

const superAdminCode = 'super-admin'

export async function isSuperAdmin(user: User) {
  return Boolean(
    await user.related('roles').query().where('code', superAdminCode).select('id').first()
  )
}

export async function isSuperAdminUser(userId: number) {
  const user = await User.findOrFail(userId)
  return isSuperAdmin(user)
}

export async function countSuperAdminUsers() {
  const superAdmin = await Role.findByOrFail('code', superAdminCode)
  const result = await User.query()
    .whereHas('roles', (roles) => roles.where('roles.id', superAdmin.id))
    .count('* as total')
    .first()

  return Number(result?.$extras.total ?? 0)
}

export async function includesSuperAdminRole(roleIds: number[]) {
  return Boolean(
    await Role.query().whereIn('id', roleIds).where('code', superAdminCode).select('id').first()
  )
}
