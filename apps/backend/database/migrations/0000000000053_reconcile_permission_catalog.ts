import { BaseSchema } from '@adonisjs/lucid/schema'

import { permissionCatalog } from '#services/permission_catalog'

const legacyPermissionMappings = [
  { oldCode: 'llm-config:read', newCode: 'agent-config:read' },
  { oldCode: 'llm-config:update', newCode: 'agent-config:update' },
  { oldCode: 'llm-config:test', newCode: 'agent-config:update' },
]

export default class extends BaseSchema {
  async up() {
    const now = new Date()

    for (const permission of permissionCatalog) {
      await this.db
        .table('permissions')
        .insert({
          code: permission.code,
          name: permission.name,
          group_name: permission.groupName,
          is_system: true,
          created_at: now,
          updated_at: now,
        })
        .onConflict('code')
        .merge({
          name: permission.name,
          group_name: permission.groupName,
          is_system: true,
          updated_at: now,
        })
    }

    for (const mapping of legacyPermissionMappings) {
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
      const assignments = await this.db
        .from('role_permissions')
        .where('permission_id', oldPermission.id)
        .select('role_id', 'created_at')

      if (assignments.length) {
        await this.db
          .table('role_permissions')
          .insert(
            assignments.map((assignment) => ({
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

    for (const mapping of legacyPermissionMappings) {
      await this.db
        .table('permissions')
        .insert({
          code: mapping.oldCode,
          name:
            mapping.oldCode === 'llm-config:read'
              ? '查看 LLM 配置'
              : mapping.oldCode === 'llm-config:update'
                ? '修改 LLM 配置'
                : '测试 LLM 连接',
          group_name: 'AI 与知识',
          is_system: true,
          created_at: now,
          updated_at: now,
        })
        .onConflict('code')
        .ignore()

      const [oldPermission, newPermission] = await Promise.all([
        this.db.from('permissions').where('code', mapping.oldCode).select('id').firstOrFail(),
        this.db.from('permissions').where('code', mapping.newCode).select('id').firstOrFail(),
      ])
      const assignments = await this.db
        .from('role_permissions')
        .where('permission_id', newPermission.id)
        .select('role_id', 'created_at')

      if (assignments.length) {
        await this.db
          .table('role_permissions')
          .insert(
            assignments.map((assignment) => ({
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
