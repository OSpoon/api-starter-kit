import { BaseSchema } from '@adonisjs/lucid/schema'

const permissions = [
  ['wecom-templates:test', '测试发送消息模板', '系统管理'],
  ['wecom-templates:upload', '上传企业微信媒体文件', '系统管理'],
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
    const role = await this.db.from('roles').where('code', 'super-admin').select('id').firstOrFail()
    const rows = await this.db
      .from('permissions')
      .whereIn(
        'code',
        permissions.map(([code]) => code)
      )
      .select('id')
    for (const permission of rows) {
      await this.db
        .table('role_permissions')
        .insert({ role_id: role.id, permission_id: permission.id, created_at: now })
        .onConflict(['role_id', 'permission_id'])
        .ignore()
    }
  }

  async down() {}
}
