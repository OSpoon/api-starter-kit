import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    const now = new Date()
    const permissions = [
      ['llm-config:read', '查看 LLM 配置', 'AI 与知识'],
      ['llm-config:update', '修改 LLM 配置', 'AI 与知识'],
      ['llm-config:test', '测试 LLM 连接', 'AI 与知识'],
    ]
    for (const [code, name, groupName] of permissions) {
      await this.db
        .table('permissions')
        .insert({ code, name, group_name: groupName, is_system: true, created_at: now })
        .onConflict('code')
        .merge({ name, group_name: groupName, is_system: true, updated_at: now })
    }
    const admin = await this.db
      .from('roles')
      .where('code', 'super-admin')
      .select('id')
      .firstOrFail()
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
        .insert({ role_id: admin.id, permission_id: permission.id, created_at: now })
        .onConflict(['role_id', 'permission_id'])
        .ignore()
    }
  }

  async down() {}
}
