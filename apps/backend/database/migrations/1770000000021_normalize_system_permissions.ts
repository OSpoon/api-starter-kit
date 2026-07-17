import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db
      .from('permissions')
      .whereIn('code', [
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
      ])
      .update({ is_system: true, updated_at: new Date() })
  }
  async down() {}
}
