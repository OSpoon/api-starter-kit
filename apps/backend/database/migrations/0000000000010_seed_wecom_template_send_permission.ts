import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    const now = new Date()
    const permission = {
      code: 'wecom-templates:send',
      name: '发送消息模板',
      group_name: '系统管理',
      is_system: true,
      created_at: now,
    }

    await this.db.table('permissions').insert(permission).onConflict('code').merge({
      name: permission.name,
      group_name: permission.group_name,
      is_system: true,
      updated_at: now,
    })

    const role = await this.db.from('roles').where('code', 'super-admin').select('id').firstOrFail()
    const row = await this.db
      .from('permissions')
      .where('code', permission.code)
      .select('id')
      .firstOrFail()
    await this.db
      .table('role_permissions')
      .insert({ role_id: role.id, permission_id: row.id, created_at: now })
      .onConflict(['role_id', 'permission_id'])
      .ignore()
  }

  async down() {}
}
