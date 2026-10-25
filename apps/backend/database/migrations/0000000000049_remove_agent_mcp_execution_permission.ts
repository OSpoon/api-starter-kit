import { BaseSchema } from '@adonisjs/lucid/schema'

const code = 'agent-mcp:execute'

export default class extends BaseSchema {
  async up() {
    const permission = await this.db.from('permissions').where('code', code).select('id').first()
    if (!permission) return

    await this.db.from('role_permissions').where('permission_id', permission.id).delete()
    await this.db.from('permissions').where('id', permission.id).delete()
  }

  async down() {
    const now = new Date()
    await this.db
      .table('permissions')
      .insert({
        code,
        name: '使用已启用的 MCP 工具',
        group_name: 'AI 与知识',
        is_system: true,
        created_at: now,
      })
      .onConflict('code')
      .ignore()

    const [permission, role] = await Promise.all([
      this.db.from('permissions').where('code', code).select('id').first(),
      this.db.from('roles').where('code', 'super-admin').select('id').first(),
    ])
    if (!permission || !role) return

    await this.db
      .table('role_permissions')
      .insert({ role_id: role.id, permission_id: permission.id, created_at: now })
      .onConflict(['role_id', 'permission_id'])
      .ignore()
  }
}
