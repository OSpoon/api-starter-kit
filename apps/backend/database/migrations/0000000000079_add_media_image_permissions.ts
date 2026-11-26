import { BaseSchema } from '@adonisjs/lucid/schema'

import { permissionCatalog } from '#services/permission_catalog'

const codes = ['media:upload', 'markdown-editor:read']

export default class extends BaseSchema {
  async up() {
    const now = new Date()
    const permissions = permissionCatalog.filter(({ code }) => codes.includes(code))

    for (const permission of permissions) {
      await this.db
        .table('permissions')
        .insert({
          code: permission.code,
          name: permission.name,
          group_name: permission.groupName,
          is_system: true,
          created_at: now,
          updated_at: now,
        })
        .onConflict('code')
        .merge({
          name: permission.name,
          group_name: permission.groupName,
          is_system: true,
          updated_at: now,
        })
    }

    const [role] = await this.db.from('roles').where('code', 'admin').select('id')
    if (!role) return

    const permissionRows = await this.db.from('permissions').whereIn('code', codes).select('id')
    await this.db
      .table('role_permissions')
      .insert(
        permissionRows.map(({ id }) => ({
          role_id: role.id,
          permission_id: id,
          created_at: now,
        }))
      )
      .onConflict(['role_id', 'permission_id'])
      .ignore()
  }

  async down() {
    const permissions = await this.db.from('permissions').whereIn('code', codes).select('id')
    if (permissions.length) {
      await this.db
        .from('role_permissions')
        .whereIn(
          'permission_id',
          permissions.map(({ id }) => id)
        )
        .delete()
      await this.db
        .from('permissions')
        .whereIn(
          'id',
          permissions.map(({ id }) => id)
        )
        .delete()
    }
  }
}
