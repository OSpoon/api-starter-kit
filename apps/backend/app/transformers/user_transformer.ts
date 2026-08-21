import { BaseTransformer } from '@adonisjs/core/transformers'

import type User from '#models/user'

export default class UserTransformer extends BaseTransformer<User> {
  toObject() {
    const roles = this.resource.roles ?? []
    const permissions = new Set(
      roles.flatMap((role) => role.permissions?.map((permission) => permission.code) ?? [])
    )

    const transformed = {
      ...this.pick(this.resource, [
        'id',
        'fullName',
        'email',
        'createdAt',
        'updatedAt',
        'initials',
        'twoFactorEnabled',
        'passwordChangedAt',
      ]),
      roles: roles.map((role) => ({ id: role.id, code: role.code, name: role.name })),
      permissions: roles.some((role) => role.code === 'super-admin')
        ? ['*']
        : [...permissions].sort(),
    }

    if (this.resource.githubLinked !== undefined) {
      return { ...transformed, githubLinked: this.resource.githubLinked }
    }

    return transformed
  }
}
