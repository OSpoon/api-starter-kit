import { BaseSchema } from '@adonisjs/lucid/schema'

const permissionMappings = [
  { oldCode: 'im-config:read', newCode: 'agent-config:read' },
  { oldCode: 'im-config:update', newCode: 'agent-config:update' },
]

export default class extends BaseSchema {
  async up() {
    const now = new Date()

    for (const mapping of permissionMappings) {
      const oldPermission = await this.db
        .from('permissions')
        .where('code', mapping.oldCode)
        .select('id')
        .first()
      if (!oldPermission) continue

      const newPermission = await this.db
        .from('permissions')
        .where('code', mapping.newCode)
        .select('id')
        .firstOrFail()
      const roleAssignments = await this.db
        .from('role_permissions')
        .where('permission_id', oldPermission.id)
        .select('role_id', 'created_at')

      if (roleAssignments.length) {
        await this.db
          .table('role_permissions')
          .insert(
            roleAssignments.map((assignment) => ({
              role_id: assignment.role_id,
              permission_id: newPermission.id,
              created_at: assignment.created_at ?? now,
            }))
          )
          .onConflict(['role_id', 'permission_id'])
          .ignore()
      }

      await this.db.from('role_permissions').where('permission_id', oldPermission.id).delete()
      await this.db.from('permissions').where('id', oldPermission.id).delete()
    }
  }

  async down() {
    const now = new Date()
    const oldPermissions = [
      { code: 'im-config:read', name: '查看 IM 配置', group_name: 'Agent管理' },
      { code: 'im-config:update', name: '修改 IM 配置', group_name: 'AI管理' },
    ]

    for (const [index, permission] of oldPermissions.entries()) {
      await this.db
        .table('permissions')
        .insert({ ...permission, is_system: true, created_at: now, updated_at: now })
        .onConflict('code')
        .merge({ ...permission, is_system: true, updated_at: now })

      const oldPermission = await this.db
        .from('permissions')
        .where('code', permission.code)
        .select('id')
        .firstOrFail()
      const newPermission = await this.db
        .from('permissions')
        .where('code', permissionMappings[index]!.newCode)
        .select('id')
        .firstOrFail()
      const roleAssignments = await this.db
        .from('role_permissions')
        .where('permission_id', newPermission.id)
        .select('role_id', 'created_at')

      if (roleAssignments.length) {
        await this.db
          .table('role_permissions')
          .insert(
            roleAssignments.map((assignment) => ({
              role_id: assignment.role_id,
              permission_id: oldPermission.id,
              created_at: assignment.created_at ?? now,
            }))
          )
          .onConflict(['role_id', 'permission_id'])
          .ignore()
      }
    }
  }
}
