import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    const now = new Date()
    const existing = await this.db.from('permissions').where('code', 'audit-logs:read').first()
    if (!existing) {
      await this.db.table('permissions').insert({
        code: 'audit-logs:read',
        name: '查看审计日志',
        group_name: '系统管理',
        is_system: true,
        created_at: now,
      })
    }

    const superAdmin = await this.db.from('roles').where('code', 'super-admin').select('id').first()
    const permission = await this.db
      .from('permissions')
      .where('code', 'audit-logs:read')
      .select('id')
      .first()
    const assigned = await this.db
      .from('role_permissions')
      .where({ role_id: superAdmin.id, permission_id: permission.id })
      .first()

    if (!assigned) {
      await this.db.table('role_permissions').insert({
        role_id: superAdmin.id,
        permission_id: permission.id,
        created_at: now,
      })
    }
  }

  async down() {}
}
