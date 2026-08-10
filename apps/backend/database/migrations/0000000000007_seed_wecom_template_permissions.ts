import { BaseSchema } from '@adonisjs/lucid/schema'

const permissions = [
  ['wecom-templates:read', '查看消息模板', '系统管理'],
  ['wecom-templates:create', '创建消息模板', '系统管理'],
  ['wecom-templates:update', '编辑消息模板', '系统管理'],
  ['wecom-templates:delete', '删除消息模板', '系统管理'],
] as const

export default class extends BaseSchema {
  async up() {
    const now = new Date()

    for (const [code, name, groupName] of permissions) {
      await this.db
        .table('permissions')
        .insert({ code, name, group_name: groupName, is_system: true, created_at: now })
        .onConflict('code')
        .merge({ name, group_name: groupName, is_system: true, updated_at: now })
    }

    const superAdmin = await this.db
      .from('roles')
      .where('code', 'super-admin')
      .select('id')
      .firstOrFail()
    const permissionRows = await this.db
      .from('permissions')
      .whereIn(
        'code',
        permissions.map(([code]) => code)
      )
      .select('id')

    for (const permission of permissionRows) {
      await this.db
        .table('role_permissions')
        .insert({ role_id: superAdmin.id, permission_id: permission.id, created_at: now })
        .onConflict(['role_id', 'permission_id'])
        .ignore()
    }
  }

  async down() {
    // System permissions are deliberately retained on rollback.
  }
}
