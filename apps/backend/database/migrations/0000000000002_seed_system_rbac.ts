import { BaseSchema } from '@adonisjs/lucid/schema'

const permissions = [
  ['dashboard:view', '查看仪表盘', '工作台'],
  ['api-keys:read', '查看 API 密钥', '系统管理'],
  ['api-keys:create', '创建 API 密钥', '系统管理'],
  ['api-keys:update', '更新 API 密钥', '系统管理'],
  ['api-keys:delete', '吊销 API 密钥', '系统管理'],
  ['users:read', '查看用户', '系统管理'],
  ['users:create', '创建用户', '系统管理'],
  ['users:update', '分配用户角色', '系统管理'],
  ['users:delete', '删除用户', '系统管理'],
  ['roles:read', '查看角色', '系统管理'],
  ['roles:create', '创建角色', '系统管理'],
  ['roles:update', '编辑角色', '系统管理'],
  ['roles:delete', '删除角色', '系统管理'],
  ['permissions:read', '查看权限', '系统管理'],
  ['permissions:create', '创建权限', '系统管理'],
  ['permissions:update', '编辑权限', '系统管理'],
  ['permissions:delete', '删除权限', '系统管理'],
  ['audit-logs:read', '查看审计日志', '系统管理'],
  ['knowledge:read', '检索知识库', '系统管理'],
  ['knowledge:manage', '管理知识库', '系统管理'],
  ['wecom-templates:read', '查看企业微信消息模板', '系统管理'],
  ['wecom-templates:create', '创建企业微信消息模板', '系统管理'],
  ['wecom-templates:update', '编辑企业微信消息模板', '系统管理'],
  ['wecom-templates:delete', '删除企业微信消息模板', '系统管理'],
] as const

export default class extends BaseSchema {
  async up() {
    const now = new Date()
    await this.db
      .table('roles')
      .insert({
        code: 'super-admin',
        name: '超级管理员',
        description: '拥有系统全部权限',
        is_system: true,
        created_at: now,
      })
      .onConflict('code')
      .merge({
        name: '超级管理员',
        description: '拥有系统全部权限',
        is_system: true,
        updated_at: now,
      })

    for (const [code, name, groupName] of permissions) {
      await this.db
        .table('permissions')
        .insert({
          code,
          name,
          group_name: groupName,
          is_system: true,
          created_at: now,
        })
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
    // System seed records are deliberately retained on rollback.
  }
}
