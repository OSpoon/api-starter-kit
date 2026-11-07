import { BaseSchema } from '@adonisjs/lucid/schema'

const removedPermissionCodes = [
  'wecom-templates:read',
  'wecom-templates:create',
  'wecom-templates:update',
  'wecom-templates:delete',
  'wecom-templates:test',
  'wecom-templates:send',
]
const removedQueryCodes = [
  'wecom_message_templates',
  'wecom_message_template_profile',
  'wecom_message_preview',
]
const removedTool = 'send_wecom_message'

export default class extends BaseSchema {
  async up() {
    const now = new Date()
    // Keep existing templates and encrypted Webhooks, but close their active permissions and workflows.
    await this.db.rawQuery(
      `UPDATE ai_agent_configurations
       SET enabled_tools = COALESCE(
         (
           SELECT jsonb_agg(items.tool)
           FROM jsonb_array_elements_text(ai_agent_configurations.enabled_tools) AS items(tool)
           WHERE items.tool <> ?
         ),
         '[]'::jsonb
       ),
       tool_modes = COALESCE(tool_modes, '{}'::jsonb) - ?
       WHERE enabled_tools \\?| ARRAY[?]
          OR COALESCE(tool_modes, '{}'::jsonb) \\?| ARRAY[?]`,
      [removedTool, removedTool, removedTool, removedTool]
    )

    await this.db
      .from('ai_agent_confirmations')
      .where('action', removedTool)
      .where('status', 'pending')
      .update({ status: 'cancelled', updated_at: now })
    await this.db
      .from('ai_agent_pending_queries')
      .whereIn('template_code', removedQueryCodes)
      .where('status', 'collecting_parameters')
      .update({ status: 'cancelled', completed_at: now, updated_at: now })

    const permissions = await this.db
      .from('permissions')
      .whereIn('code', removedPermissionCodes)
      .select('id')
    const permissionIds = permissions.map((permission) => permission.id)
    if (permissionIds.length) {
      await this.db.from('role_permissions').whereIn('permission_id', permissionIds).delete()
      await this.db.from('permissions').whereIn('id', permissionIds).delete()
    }
  }

  async down() {
    const now = new Date()
    const permissions = [
      ['wecom-templates:read', '查看企业微信消息模板'],
      ['wecom-templates:create', '创建企业微信消息模板'],
      ['wecom-templates:update', '编辑企业微信消息模板'],
      ['wecom-templates:delete', '删除企业微信消息模板'],
      ['wecom-templates:test', '测试发送消息模板'],
      ['wecom-templates:send', '发送企业微信消息'],
    ] as const

    // shortcut: rollback restores permission definitions but not role grants; reassign them if the feature returns.
    for (const [code, name] of permissions) {
      await this.db
        .table('permissions')
        .insert({
          code,
          name,
          group_name: '系统管理',
          is_system: true,
          created_at: now,
          updated_at: now,
        })
        .onConflict('code')
        .ignore()
    }
  }
}
