import { BaseSchema } from '@adonisjs/lucid/schema'

const permissions = [
  { code: 'im-config:read', name: '查看 IM Bot', source: 'agent-config:read' },
  { code: 'im-config:update', name: '管理 IM Bot', source: 'agent-config:update' },
]

export default class extends BaseSchema {
  async up() {
    const now = new Date()
    for (const permission of permissions) {
      await this.db
        .table('permissions')
        .insert({
          code: permission.code,
          name: permission.name,
          group_name: 'Agent管理',
          is_system: true,
          created_at: now,
          updated_at: now,
        })
        .onConflict('code')
        .merge({ name: permission.name, group_name: 'Agent管理', is_system: true, updated_at: now })

      const target = await this.db
        .from('permissions')
        .where('code', permission.code)
        .select('id')
        .firstOrFail()
      const source = await this.db
        .from('permissions')
        .where('code', permission.source)
        .select('id')
        .firstOrFail()
      const grants = await this.db
        .from('role_permissions')
        .where('permission_id', source.id)
        .select('role_id', 'created_at')
      if (grants.length) {
        await this.db
          .table('role_permissions')
          .insert(
            grants.map((grant) => ({
              role_id: grant.role_id,
              permission_id: target.id,
              created_at: grant.created_at ?? now,
            }))
          )
          .onConflict(['role_id', 'permission_id'])
          .ignore()
      }
    }
  }

  async down() {
    const now = new Date()
    for (const permission of permissions) {
      const source = await this.db
        .from('permissions')
        .where('code', permission.source)
        .select('id')
        .firstOrFail()
      const target = await this.db
        .from('permissions')
        .where('code', permission.code)
        .select('id')
        .first()
      if (!target) continue
      const grants = await this.db
        .from('role_permissions')
        .where('permission_id', target.id)
        .select('role_id', 'created_at')
      if (grants.length) {
        await this.db
          .table('role_permissions')
          .insert(
            grants.map((grant) => ({
              role_id: grant.role_id,
              permission_id: source.id,
              created_at: grant.created_at ?? now,
            }))
          )
          .onConflict(['role_id', 'permission_id'])
          .ignore()
      }
      await this.db.from('role_permissions').where('permission_id', target.id).delete()
      await this.db.from('permissions').where('id', target.id).delete()
    }
  }
}
