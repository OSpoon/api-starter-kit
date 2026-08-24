import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db
      .from('permissions')
      .whereIn('code', [
        'llm-config:read',
        'llm-config:update',
        'llm-config:test',
        'im-config:read',
        'knowledge:read',
        'knowledge:manage',
      ])
      .update({ group_name: 'Agent管理', updated_at: new Date() })
  }

  async down() {}
}
