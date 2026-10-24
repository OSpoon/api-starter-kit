import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    const permissions = await this.db
      .from('permissions')
      .where((query) =>
        query
          .where('is_system', false)
          .orWhereIn('code', ['permissions:create', 'permissions:update', 'permissions:delete'])
      )
      .select('id')
    const ids = permissions.map((permission) => permission.id)
    if (!ids.length) return

    await this.db.from('role_permissions').whereIn('permission_id', ids).delete()
    await this.db.from('permissions').whereIn('id', ids).delete()
  }

  async down() {
    // shortcut: rollback cannot restore removed custom permissions or role grants; restore a pre-migration database backup.
  }
}
