import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    const groups = [
      {
        name: '权限管理',
        codes: [
          'users:read',
          'users:create',
          'users:update',
          'users:delete',
          'roles:read',
          'roles:create',
          'roles:update',
          'roles:delete',
          'permissions:read',
          'permissions:create',
          'permissions:update',
          'permissions:delete',
        ],
      },
      {
        name: 'AI管理',
        codes: [
          'llm-config:read',
          'llm-config:update',
          'llm-config:test',
          'im-config:read',
          'knowledge:read',
          'knowledge:manage',
        ],
      },
      {
        name: '系统管理',
        codes: [
          'system-status:read',
          'api-keys:read',
          'api-keys:create',
          'api-keys:update',
          'api-keys:delete',
          'wecom-templates:read',
          'wecom-templates:create',
          'wecom-templates:update',
          'wecom-templates:delete',
          'wecom-templates:send',
          'wecom-templates:test',
          'audit-logs:read',
        ],
      },
    ]
    for (const group of groups) {
      await this.db
        .from('permissions')
        .whereIn('code', group.codes)
        .update({ group_name: group.name, updated_at: new Date() })
    }
  }

  async down() {}
}
