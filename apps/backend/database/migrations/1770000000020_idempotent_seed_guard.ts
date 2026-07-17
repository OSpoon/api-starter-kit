import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    const existing = await this.db.from('roles').where('code', 'super-admin').select('id').first()
    if (existing) return

    const permissions = [
      ['dashboard:view', '查看仪表盘', '工作台'],
      ['api-keys:read', '查看 API 密钥', '系统管理'],
      ['api-keys:create', '创建 API 密钥', '系统管理'],
      ['api-keys:update', '更新 API 密钥', '系统管理'],
      ['api-keys:delete', '吊销 API 密钥', '系统管理'],
      ['users:read', '查看用户', '系统管理'],
      ['users:update', '分配用户角色', '系统管理'],
      ['roles:read', '查看角色', '系统管理'],
      ['roles:create', '创建角色', '系统管理'],
      ['roles:update', '编辑角色', '系统管理'],
      ['roles:delete', '删除角色', '系统管理'],
      ['permissions:read', '查看权限', '系统管理'],
      ['users:create', '创建用户', '系统管理'],
      ['users:delete', '删除用户', '系统管理'],
      ['permissions:create', '创建权限', '系统管理'],
      ['permissions:update', '编辑权限', '系统管理'],
      ['permissions:delete', '删除权限', '系统管理'],
      ['audit-logs:read', '查看审计日志', '系统管理'],
    ] as const

    await this.db.table('roles').insert({
      code: 'super-admin',
      name: '超级管理员',
      description: '拥有系统全部权限',
      is_system: true,
      created_at: new Date(),
    })
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
    const allPermissions = await this.db.from('permissions').select('id')
    await this.db.table('role_permissions').insert(
      allPermissions.map((permission) => ({
        role_id: superAdmin.id,
        permission_id: permission.id,
        created_at: new Date(),
      }))
    )
    const firstUser = await this.db.from('users').orderBy('id', 'asc').select('id').first()
    if (firstUser)
      await this.db
        .table('user_roles')
        .insert({ user_id: firstUser.id, role_id: superAdmin.id, created_at: new Date() })
  }

  async down() {}
}
