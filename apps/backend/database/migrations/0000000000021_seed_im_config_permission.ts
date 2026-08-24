import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    const now = new Date()
    const permission = {
      code: 'im-config:read',
      name: '查看 IM 配置',
      group_name: 'AI管理',
      is_system: true,
      created_at: now,
      updated_at: now,
    }
    await this.db.table('permissions').insert(permission).onConflict('code').merge(permission)
    const admin = await this.db
      .from('roles')
      .where('code', 'super-admin')
      .select('id')
      .firstOrFail()
    const row = await this.db
      .from('permissions')
      .where('code', permission.code)
      .select('id')
      .firstOrFail()
    await this.db
      .table('role_permissions')
      .insert({ role_id: admin.id, permission_id: row.id, created_at: now })
      .onConflict(['role_id', 'permission_id'])
      .ignore()
  }

  async down() {}
}
