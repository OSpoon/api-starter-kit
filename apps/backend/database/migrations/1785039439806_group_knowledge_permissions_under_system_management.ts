import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db
      .from('permissions')
      .whereIn('code', ['knowledge:read', 'knowledge:manage'])
      .update({ group_name: '系统管理' })
  }

  async down() {
    await this.db
      .from('permissions')
      .whereIn('code', ['knowledge:read', 'knowledge:manage'])
      .update({ group_name: '知识库' })
  }
}
