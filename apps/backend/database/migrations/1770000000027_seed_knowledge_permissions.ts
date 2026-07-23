import { BaseSchema } from '@adonisjs/lucid/schema'

const permissions = [
  ['knowledge:read', '检索知识库'],
  ['knowledge:manage', '管理知识库'],
] as const

export default class extends BaseSchema {
  async up() {
    const now = new Date()
    const superAdmin = await this.db.from('roles').where('code', 'super-admin').select('id').first()

    for (const [code, name] of permissions) {
      const existing = await this.db.from('permissions').where('code', code).first()
      if (!existing) {
        await this.db.table('permissions').insert({
          code,
          name,
          group_name: '知识库',
          is_system: true,
          created_at: now,
        })
      }
      const permission = await this.db.from('permissions').where('code', code).select('id').first()
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
  }

  async down() {}
}
