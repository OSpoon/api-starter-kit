/*
|--------------------------------------------------------------------------
| Bouncer abilities
|--------------------------------------------------------------------------
|
| You may export multiple abilities from this file and pre-register them
| when creating the Bouncer instance.
|
| Pre-registered policies and abilities can be referenced as a string by their
| name. Also they are must if want to perform authorization inside Edge
| templates.
|
*/

import { Bouncer } from '@adonisjs/bouncer'

import type User from '#models/user'
import type { PermissionCode } from '#services/permission_catalog'

export const access = Bouncer.ability(async (user: User, permission: PermissionCode) => {
  const roles = await user.related('roles').query().preload('permissions')

  return roles.some(
    (role) =>
      role.code === 'super-admin' || role.permissions.some((item) => item.code === permission)
  )
})
