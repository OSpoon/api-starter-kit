import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

import Role from '#models/role'
import User from '#models/user'

const superAdminCode = 'super-admin'

export async function isSuperAdmin(user: User) {
  return Boolean(
    await user.related('roles').query().where('code', superAdminCode).select('id').first()
  )
}

export async function lockSuperAdminRole(client: TransactionClientContract) {
  return Role.query({ client }).where('code', superAdminCode).forUpdate().firstOrFail()
}

export async function countEnabledSuperAdminUsers(
  client: TransactionClientContract,
  roleId: number
) {
  const result = await User.query({ client })
    .whereNull('disabled_at')
    .whereHas('roles', (roles) => roles.where('roles.id', roleId))
    .count('* as total')
    .first()

  return Number(result?.$extras.total ?? 0)
}
