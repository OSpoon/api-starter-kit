import { BaseSchema } from '@adonisjs/lucid/schema'

const permissions = [
  ['users:create', '创建用户', '系统管理'],
  ['users:delete', '删除用户', '系统管理'],
  ['permissions:create', '创建权限', '系统管理'],
  ['permissions:update', '编辑权限', '系统管理'],
  ['permissions:delete', '删除权限', '系统管理'],
] as const

export default class extends BaseSchema {
  async up() {
    await this.db.from('permissions').whereNotNull('id').update({ is_system: true })
    await this.db.table('permissions').insert(
      permissions.map(([code, name, groupName]) => ({
        code,
        name,
        group_name: groupName,
        is_system: true,
        created_at: new Date(),
      }))
    )
    const superAdmin = await this.db.from('roles').where('code', 'super-admin').select('id').first()
    const newPermissions = await this.db
      .from('permissions')
      .whereIn(
        'code',
        permissions.map(([code]) => code)
      )
      .select('id')
    await this.db.table('role_permissions').insert(
      newPermissions.map((permission) => ({
        role_id: superAdmin.id,
        permission_id: permission.id,
        created_at: new Date(),
      }))
    )
  }

  async down() {}
}
